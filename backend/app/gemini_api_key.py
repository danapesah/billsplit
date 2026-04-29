"""Resolve the Gemini API key from AWS Secrets Manager."""

from __future__ import annotations

import json
import logging
import os

logger = logging.getLogger(__name__)

# https://aws.amazon.com/developer/language/python/
SECRET_NAME = "BillSplit-gemini-api-key"
REGION_NAME = "us-east-1"

_cached_secret_name: str | None = None
_cached_key: str | None = None
_logged_key_presence: bool = False


def _log_key_present(source: str, key: str) -> None:
    """Log that a key exists (never log the secret value)."""
    global _logged_key_presence
    if _logged_key_presence:
        return
    _logged_key_presence = True
    logger.info(
        "Gemini API key is present (source=%s, length=%d chars; value not logged)",
        source,
        len(key),
    )


def _parse_secret_string(secret_string: str) -> str:
    s = secret_string.strip()
    if not s:
        return ""
    if s.startswith("{"):
        try:
            data = json.loads(s)
            if isinstance(data, dict):
                for k in (
                    "BillSplit-gemini-api-key",
                    "GEMINI_API_KEY",
                    "API_KEY",
                    "api_key",
                ):
                    v = data.get(k)
                    if v is not None and str(v).strip():
                        return str(v).strip()
        except json.JSONDecodeError:
            pass
    return s


def get_secret() -> str:
    """Fetch API key from AWS Secrets Manager (snippet-style)."""
    try:
        import boto3
        from botocore.exceptions import ClientError
    except ImportError as e:
        raise RuntimeError(
            "boto3 is required to load the Gemini API key from AWS Secrets Manager. "
            "Install boto3.",
        ) from e

    secret_name = SECRET_NAME
    region_name = REGION_NAME

    session = boto3.session.Session()
    client = session.client(
        service_name="secretsmanager",
        region_name=region_name,
    )

    try:
        get_secret_value_response = client.get_secret_value(SecretId=secret_name)
    except ClientError as e:
        raise RuntimeError("Could not load Gemini API key from AWS Secrets Manager.") from e

    secret = get_secret_value_response.get("SecretString") or ""

    key = _parse_secret_string(secret)
    if not key:
        raise RuntimeError("Gemini API secret is empty or has no recognizable API key field.")
    return key


def resolve_gemini_api_key() -> str:
    """Return the Gemini API key from env var, then AWS Secrets Manager."""
    global _cached_secret_name, _cached_key

    # Local/dev first: loaded from backend/.env by app.main via python-dotenv.
    env_key = (os.getenv("BILLSPLIT_GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY") or "").strip()
    if env_key:
        _cached_key = env_key
        _cached_secret_name = "__env__"
        _log_key_present("environment variable", env_key)
        return env_key

    if _cached_key is not None and _cached_secret_name == SECRET_NAME:
        _log_key_present("cache", _cached_key)
        return _cached_key

    _cached_key = get_secret()
    _cached_secret_name = SECRET_NAME
    _log_key_present(f"AWS Secrets Manager ({SECRET_NAME})", _cached_key)

    return _cached_key

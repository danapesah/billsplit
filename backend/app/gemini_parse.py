"""Extract bill line items from receipt images using Google Gemini (vision).

Environment (server-side only; never expose keys to clients):

- BILLSPLIT_GEMINI_API_KEY: Google AI Studio API key for local/dev. If unset, the key is loaded
  from AWS Secrets Manager (``BillSplit-gemini-api-key`` in ``eu-north-1``; requires boto3 and IAM
  secretsmanager:GetSecretValue).
- GEMINI_MODEL: Model id (default: gemini-2.0-flash).
"""
from __future__ import annotations

import json
import logging
import os
import re
import uuid
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from .gemini_api_key import resolve_gemini_api_key
from .models import LineItem, ParseResponse

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-2.5-flash"
MAX_ITEMS = 50


class GeminiAPIError(Exception):
    """Raised when Gemini bill parsing fails."""

    def __init__(self, message: str, status_code: int = 503) -> None:
        super().__init__(message)
        self.status_code = status_code


class _GeminiLineIn(BaseModel):
    """Single row as returned by the model before assigning LineItem.id."""

    description: str = Field(..., min_length=1, max_length=500)
    amount: float = Field(..., gt=0, le=100_000)
    quantity: int = Field(1, ge=1, le=9999)
    line_kind: Literal["ordered", "shared_fee", "discount"] = "ordered"


def _strip_json_fences(text: str) -> str:
    t = text.strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", t, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return t


def _parse_items_json(text: str) -> tuple[list[LineItem], float | None]:
    payload = json.loads(_strip_json_fences(text))
    receipt_total: float | None = None
    if isinstance(payload, dict):
        rt = payload.get("receipt_total")
        if rt is not None:
            try:
                rf = float(rt)
                if rf > 0 and rf <= 1_000_000:
                    receipt_total = round(rf, 2)
            except (TypeError, ValueError):
                pass
        inner = payload.get("items")
        if inner is not None:
            payload = inner
    if not isinstance(payload, list):
        raise ValueError("Expected JSON array or object with 'items'")
    items: list[LineItem] = []
    for entry in payload[:MAX_ITEMS]:
        if not isinstance(entry, dict):
            continue
        try:
            raw_desc = entry.get("description")
            if raw_desc is None:
                continue
            kind_raw = entry.get("line_kind") or entry.get("kind")
            line_kind: Literal["ordered", "shared_fee", "discount"] = "ordered"
            if isinstance(kind_raw, str):
                k = kind_raw.strip().lower().replace("-", "_")
                if k in ("shared_fee", "shared", "fee", "split_all", "all"):
                    line_kind = "shared_fee"
                elif k in ("discount", "הנחה", "reduction", "promo", "promotion", "coupon"):
                    line_kind = "discount"
                elif k in ("ordered", "item", "product"):
                    line_kind = "ordered"
            q = entry.get("quantity", 1)
            try:
                qi = int(q)
            except (TypeError, ValueError):
                qi = 1
            try:
                amt_f = float(entry.get("amount"))
            except (TypeError, ValueError):
                amt_f = None
            else:
                if line_kind == "discount" and amt_f < 0:
                    amt_f = abs(amt_f)
            row = _GeminiLineIn.model_validate(
                {
                    "description": str(raw_desc).strip(),
                    "amount": amt_f if amt_f is not None else entry.get("amount"),
                    "quantity": max(1, min(9999, qi)),
                    "line_kind": line_kind,
                }
            )
        except ValidationError:
            continue
        desc_str = row.description[:200] or "Item"
        items.append(
            LineItem(
                id=str(uuid.uuid4()),
                description=desc_str,
                amount=round(row.amount, 2),
                quantity=row.quantity,
                line_kind=row.line_kind,
            )
        )
    return items, receipt_total


def _map_exception_to_status(exc: BaseException) -> int:
    msg = str(exc).lower()
    if "429" in msg or "resource exhausted" in msg or "quota" in msg:
        return 503
    if "503" in msg or "unavailable" in msg:
        return 503
    if "502" in msg or "bad gateway" in msg:
        return 502
    if "400" in msg:
        return 400
    if "permission" in msg or "api key" in msg:
        return 502
    return 503


_PROMPT = """You are parsing a restaurant or retail receipt image. Receipts may be in English, Hebrew, mixed Hebrew/English, or RTL layout — treat all of these equally.

Return ONE JSON object (no markdown) with this shape:
{"receipt_total": number or null, "items": [ ... ]}

receipt_total:
- The final total payable in ILS (amount due), if clearly visible.
- English labels: Total, Amount due, Balance, Pay this amount, etc.
- Hebrew labels often include: סה"כ, סה"כ לתשלום, לתשלום, יתרה לתשלום, סכום כולל (verify it is the final total, not a subtotal).
- Currency may show as ₪, ש"ח, NIS, ILS — amounts are still in shekels.
- If missing or unreadable, use null.

Hebrew / RTL layout:
- Text may read right-to-left; line items may have names on one side and prices on the other — still pair each description with its line total.
- Preserve item text in the original language (Hebrew, English, or mixed) in "description" — do not translate names to English unless the receipt is English-only.

Common Hebrew vocabulary (not exhaustive):
- מע"מ / מעמ — VAT; דמי שירות — service charge; הנחה — discount; מחיר — price; כמות / יחידות / יח' — quantity or units.

items — each priced row on the receipt:

1) Quantity (important)
- Put the count of units in "quantity" (integer >= 1). Never fold quantity into "description".
- English-style: "2 x Burger", "2x Burger", "Burger ×2" → description "Burger", quantity 2.
- Hebrew-style: leading number with × or × before text, or "2 יח'" / "כמות 2" patterns — same rule: separate quantity from the item name.
- A single line with no quantity shown → quantity 1.
- The line's printed price goes in "amount" as the LINE TOTAL for that row (what the receipt shows for that line), in ILS.

2) line_kind
- "ordered" — food, drinks, goods the customer ordered (default).
- "shared_fee" — tax/VAT (VAT / מע"מ / מעמ), service charge (service fee / דמי שירות / service), cover charge, mandatory tip printed on the receipt, rounding adjustments, or other lines meant to be split equally among everyone (not individual dishes).
- "discount" — any discount line: English (Discount, Promo, Coupon, Loyalty, etc.) or Hebrew הנחה / מבצע / קופון when the line reduces the bill. If the receipt prints a negative amount (e.g. -15.00), still output "amount" as a positive number equal to the discount magnitude (15.00). quantity is usually 1 for discount rows.

3) Fields per item (exact keys):
{"description": string, "quantity": number, "amount": number, "line_kind": "ordered" | "shared_fee" | "discount"}

Rules:
- description: item name only — no leading "2x", "3 ×", etc.
- amount: positive decimal, ILS, matching the receipt line (for discounts, use the absolute value of the discount).
- Include shared_fee lines when they have an amount; users will split them among all by default.
- Include discount lines when present; do not classify discounts as ordered or shared_fee.
- Skip payment method lines (cash/card / מזומן / אשראי), change (עודף), store address/phone-only lines, and duplicate subtotals that are not line items.
- If unsure a line is a real charge, skip it.

Output: raw JSON only, no markdown fences, no explanation."""


def parse_bill_with_gemini(image_bytes: bytes, mime_type: str) -> ParseResponse:
    """
    Call Gemini with the image. Returns ParseResponse with at least one line item,
    or raises GeminiAPIError.
    """
    try:
        api_key = resolve_gemini_api_key()
    except RuntimeError as e:
        raise GeminiAPIError(str(e), status_code=503) from e
    if not api_key:
        raise GeminiAPIError(
            "Bill parsing is not configured. Set BILLSPLIT_GEMINI_API_KEY or AWS secret BillSplit-gemini-api-key (eu-north-1).",
            status_code=503,
        )

    model_name = os.getenv("GEMINI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    mt = (mime_type or "image/jpeg").split(";")[0].strip().lower()
    if mt == "image/jpg":
        mt = "image/jpeg"

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    try:
        response = client.models.generate_content(
            model=model_name,
            contents=[_PROMPT, types.Part.from_bytes(data=image_bytes, mime_type=mt)],
            config=types.GenerateContentConfig(max_output_tokens=8192),
        )
    except Exception as exc:
        logger.warning("Gemini request failed: %s", type(exc).__name__)
        raise GeminiAPIError(
            "Bill parsing service temporarily unavailable.",
            status_code=_map_exception_to_status(exc),
        ) from exc

    if not getattr(response, "candidates", None):
        logger.warning("Gemini returned no candidates (blocked or empty)")
        raise GeminiAPIError("Bill parsing service returned no result.", status_code=502)

    try:
        text = (response.text or "").strip()
    except Exception as exc:
        logger.warning("Gemini response has no text: %s", type(exc).__name__)
        raise GeminiAPIError(
            "Bill parsing service returned an invalid response.",
            status_code=502,
        ) from exc

    if not text:
        raise GeminiAPIError("Empty response from bill parser.", status_code=502)

    try:
        items, receipt_total = _parse_items_json(text)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("Gemini JSON parse failed: %s", type(exc).__name__)
        raise GeminiAPIError("Could not parse bill parser output.", status_code=502) from exc

    if not items:
        raise GeminiAPIError(
            "No line items could be extracted from the receipt.",
            status_code=422,
        )

    raw_text = "\n".join(
        f"{it.description}\tqty={it.quantity}\t{it.amount}\t{it.line_kind}" for it in items
    )
    return ParseResponse(items=items, raw_text=raw_text, receipt_total=receipt_total)

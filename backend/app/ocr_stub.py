"""Bill image parsing via Gemini only (no OCR fallback)."""
from __future__ import annotations

from .gemini_parse import parse_bill_with_gemini
from .models import ParseResponse


def parse_bill_image(content: bytes, content_type: str | None) -> ParseResponse:
    allowed = (
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
    )
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct and ct not in allowed:
        raise ValueError("Only image uploads are supported (JPEG, PNG, WebP, GIF)")

    mime_for_gemini = ct if ct else "image/jpeg"
    return parse_bill_with_gemini(content, mime_for_gemini)

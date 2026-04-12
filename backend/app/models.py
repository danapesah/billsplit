from typing import Literal

from pydantic import BaseModel, Field


class LineItem(BaseModel):
    id: str
    description: str
    amount: float = Field(..., description="Line total in ILS (shekels), as printed for that row")
    quantity: int = Field(1, ge=1, le=9999, description="Unit count; separate from description")
    line_kind: Literal["ordered", "shared_fee", "discount"] = Field(
        "ordered",
        description="ordered=split amount; shared_fee=shown from receipt only (not added — tax/service assumed in ordered total); discount=split evenly, subtracted from everyone",
    )


class ParseResponse(BaseModel):
    items: list[LineItem]
    raw_text: str | None = None
    receipt_total: float | None = Field(
        None,
        description="Total payable on the receipt (before app tip slider), if visible",
    )


class PersonIn(BaseModel):
    id: str
    name: str


class AssignmentIn(BaseModel):
    line_item_id: str
    person_ids: list[str]


class CalculateRequest(BaseModel):
    line_items: list[LineItem]
    assignments: list[AssignmentIn]
    tip_percent: float = Field(..., ge=0, le=100)
    people: list[PersonIn]


class PerPersonOut(BaseModel):
    person_id: str
    name: str
    subtotal: float
    tip_amount: float
    total: int  # whole shekels, rounded up


class TotalsOut(BaseModel):
    subtotal: float  # bill before app tip (ordered lines − discounts; shared_fee excluded)
    receipt_subtotal: float  # same as subtotal; kept for API compatibility
    tip: float
    grand: float  # subtotal + tip


class CalculateResponse(BaseModel):
    per_person: list[PerPersonOut]
    totals: TotalsOut

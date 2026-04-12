"""Currency-safe split: even line splits, proportional tip, whole-shekel ceiling per person.

shared_fee lines (VAT, service, etc.) are ignored in money math — receipts often list them
separately even though the payable total already includes them in the food lines.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
from collections import defaultdict

from .models import AssignmentIn, LineItem, PersonIn, PerPersonOut, TotalsOut


def _d(x: float | str | Decimal) -> Decimal:
    return Decimal(str(x))


def _quantize_2(d: Decimal) -> Decimal:
    return d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _ceil_whole_shekel(amount: Decimal) -> int:
    """Round up to next whole shekel (integer)."""
    if amount <= 0:
        return 0
    return int(amount.to_integral_value(rounding=ROUND_CEILING))


def _split_line_agorot(line_total_agorot: int, n: int) -> list[int]:
    """Split integer agorot evenly; remainder goes to first k people."""
    if n <= 0:
        return []
    base = line_total_agorot // n
    rem = line_total_agorot % n
    return [base + (1 if i < rem else 0) for i in range(n)]


def calculate_split(
    line_items: list[LineItem],
    assignments: list[AssignmentIn],
    tip_percent: Decimal,
    people: list[PersonIn],
) -> tuple[list[PerPersonOut], TotalsOut]:
    person_by_id = {p.id: p.name for p in people}
    line_by_id = {li.id: li for li in line_items}

    # Assigned ordered items only (shared_fee rows are informational — not added again).
    food_agorot: dict[str, int] = defaultdict(int)

    for a in assignments:
        line = line_by_id.get(a.line_item_id)
        if (
            not line
            or line.line_kind == "discount"
            or line.line_kind == "shared_fee"
            or not a.person_ids
        ):
            continue
        total_agorot = int((_d(line.amount) * 100).to_integral_value(rounding=ROUND_HALF_UP))
        n = len(a.person_ids)
        parts = _split_line_agorot(total_agorot, n)
        for pid, part in zip(a.person_ids, parts):
            if pid in person_by_id:
                food_agorot[pid] += part

    # Discounts: subtract the line total evenly from everyone (assignments ignored).
    n_people = len(people)
    if n_people > 0:
        pids_ordered = [p.id for p in people]
        for li in line_items:
            if li.line_kind != "discount":
                continue
            total_agorot = int((_d(li.amount) * 100).to_integral_value(rounding=ROUND_HALF_UP))
            parts = _split_line_agorot(total_agorot, n_people)
            for pid, part in zip(pids_ordered, parts):
                if pid in person_by_id:
                    food_agorot[pid] -= part

    bill_agorot = sum(food_agorot.values())
    subtotal = _quantize_2(Decimal(bill_agorot) / Decimal(100))

    net_decimal = _quantize_2(Decimal(bill_agorot) / Decimal(100))
    tip_raw = _quantize_2(max(Decimal(0), net_decimal) * tip_percent / Decimal(100))
    tip_agorot = int((tip_raw * 100).to_integral_value(rounding=ROUND_HALF_UP))

    tip_per_person_agorot: dict[str, int] = {p.id: 0 for p in people}
    positive_weight: dict[str, int] = {p.id: max(0, food_agorot[p.id]) for p in people}
    weight_sum = sum(positive_weight.values())

    if weight_sum > 0 and tip_agorot > 0:
        allocated = 0
        pids = [p.id for p in people]
        for pid in pids:
            share = (tip_agorot * positive_weight[pid]) // weight_sum
            tip_per_person_agorot[pid] = int(share)
            allocated += int(share)
        remainder = tip_agorot - allocated
        j = 0
        while remainder > 0 and pids:
            tip_per_person_agorot[pids[j % len(pids)]] += 1
            remainder -= 1
            j += 1
    elif tip_agorot > 0 and weight_sum == 0:
        # Edge: tip on net zero/negative but positive tip slider — split evenly
        n = len(people)
        if n:
            parts = _split_line_agorot(tip_agorot, n)
            for p, part in zip(people, parts):
                tip_per_person_agorot[p.id] = part

    grand_agorot = bill_agorot + tip_agorot
    receipt_subtotal = subtotal  # same as bill before tip; shared_fee lines excluded
    tip_decimal = Decimal(tip_agorot) / Decimal(100)
    grand = _quantize_2(Decimal(grand_agorot) / Decimal(100))

    per_person: list[PerPersonOut] = []
    for p in people:
        fa = food_agorot[p.id]
        ta = tip_per_person_agorot[p.id]
        food_d = _quantize_2(Decimal(fa) / Decimal(100))
        tip_d = _quantize_2(Decimal(ta) / Decimal(100))
        exact = food_d + tip_d
        total_whole = _ceil_whole_shekel(exact)
        per_person.append(
            PerPersonOut(
                person_id=p.id,
                name=p.name,
                subtotal=float(food_d),
                tip_amount=float(tip_d),
                total=total_whole,
            )
        )

    totals = TotalsOut(
        subtotal=float(subtotal),
        receipt_subtotal=float(receipt_subtotal),
        tip=float(tip_decimal),
        grand=float(grand),
    )
    return per_person, totals

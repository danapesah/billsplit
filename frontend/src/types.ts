export type LineKind = 'ordered' | 'shared_fee' | 'discount'

export interface LineItem {
  id: string
  description: string
  amount: number
  /** Unit count; shown separately from description (not embedded in the name). */
  quantity: number
  /** ordered | shared_fee (tax/service, assignable) | discount (split evenly, no UI assignment). */
  line_kind: LineKind
}

export interface Person {
  id: string
  name: string
}

export interface TotalsOut {
  /** Bill before app tip (ordered lines; shared_fee rows not counted). */
  subtotal: number
  /** Same as subtotal; optional for older saved sessions. */
  receipt_subtotal?: number
  tip: number
  grand: number
}

export interface PerPersonOut {
  person_id: string
  name: string
  subtotal: number
  tip_amount: number
  total: number
}

export interface CalculateResponse {
  per_person: PerPersonOut[]
  totals: TotalsOut
}

export interface ParseResponse {
  items: LineItem[]
  raw_text?: string | null
  /** Total on the receipt (ILS), when the parser could read it. */
  receipt_total?: number | null
}

/** Backward-compatible shape for stored/API line items missing new fields. */
export function normalizeLineItem(
  li: Pick<LineItem, 'id' | 'description' | 'amount'> & Partial<Pick<LineItem, 'quantity' | 'line_kind'>>,
): LineItem {
  const q = li.quantity
  const quantity = typeof q === 'number' && Number.isFinite(q) && q >= 1 ? Math.floor(q) : 1
  const line_kind: LineKind =
    li.line_kind === 'shared_fee'
      ? 'shared_fee'
      : li.line_kind === 'discount'
        ? 'discount'
        : 'ordered'
  return {
    id: li.id,
    description: li.description,
    amount: li.amount,
    quantity,
    line_kind,
  }
}

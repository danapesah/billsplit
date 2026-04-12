import type { LineItem } from './types'

export interface ReceiptLineSums {
  linesSum: number
  sharedChargesSum: number
  linesSumExcludingShared: number
}

export function computeReceiptLineSums(lineItems: LineItem[]): ReceiptLineSums {
  const linesSum = lineItems.reduce(
    (s, li) =>
      s + (li.line_kind === 'discount' ? -Number(li.amount) : Number(li.amount)),
    0,
  )
  const sharedChargesSum = lineItems.reduce(
    (s, li) => (li.line_kind === 'shared_fee' ? s + Number(li.amount) : s),
    0,
  )
  return {
    linesSum,
    sharedChargesSum,
    linesSumExcludingShared: linesSum - sharedChargesSum,
  }
}

/** Same rule as Assign: warn when receipt total disagrees with parsed lines (both with and without shared-fee rows). */
export function shouldShowReceiptMismatch(
  lineItems: LineItem[],
  receiptTotal: number | null,
): boolean {
  if (receiptTotal == null || !Number.isFinite(receiptTotal)) return false
  const { linesSum, linesSumExcludingShared } = computeReceiptLineSums(lineItems)
  const receiptDiff = Math.abs(linesSum - receiptTotal)
  const receiptDiffExcludingShared = Math.abs(linesSumExcludingShared - receiptTotal)
  return receiptDiff > 0.02 && receiptDiffExcludingShared > 0.02
}

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BillSplitMark } from '../components/BillSplitMark'
import { useBillSplit } from '../context/BillSplitContext'
import { formatIls } from '../format'
import { computeReceiptLineSums, shouldShowReceiptMismatch } from '../receiptTotals'

export function ReceiptMismatchPage() {
  const nav = useNavigate()
  const { lineItems, receiptTotal, resetSession } = useBillSplit()

  const hasMismatch = shouldShowReceiptMismatch(lineItems, receiptTotal)

  useEffect(() => {
    if (lineItems.length > 0 && !hasMismatch) {
      nav('/assign', { replace: true })
    }
  }, [lineItems.length, hasMismatch, nav])

  if (lineItems.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <p className="text-slate-400">No bill loaded.</p>
        <button type="button" className="mt-4 text-emerald-400" onClick={() => nav('/', { replace: true })}>
          ← Upload a bill
        </button>
      </div>
    )
  }

  if (!hasMismatch) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <p className="text-slate-400">Redirecting…</p>
      </div>
    )
  }

  const { linesSum } = computeReceiptLineSums(lineItems)

  function retakePhoto() {
    resetSession()
    nav('/', { replace: true })
  }

  function continueAnyway() {
    nav('/assign', { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-950/80 text-3xl ring-2 ring-amber-700/50">
          ⚠️
        </div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
          <BillSplitMark className="h-8 w-8" />
          Totals don&apos;t match
        </h1>
        <p className="text-sm leading-relaxed text-slate-300">
          The amount printed on the receipt doesn&apos;t match the sum of the line items we read. For more accurate
          results, try taking a new photo of the bill — use good light, hold the camera steady, and make sure the bottom
          total is visible.
        </p>
      </header>

      <section className="rounded-2xl border border-amber-900/60 bg-amber-950/30 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm text-slate-400">Receipt total</span>
          <span className="text-lg font-semibold tabular-nums text-white">
            {receiptTotal != null ? formatIls(receiptTotal) : '—'}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-amber-900/40 pt-3">
          <span className="text-sm text-slate-400">Sum of line items</span>
          <span className="text-lg font-semibold tabular-nums text-amber-100">{formatIls(linesSum)}</span>
        </div>
      </section>

      <div className="mt-auto flex flex-col gap-3">
        <button
          type="button"
          onClick={() => retakePhoto()}
          className="w-full rounded-2xl bg-emerald-600 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-900/30"
        >
          Take a new photo
        </button>
        <button
          type="button"
          onClick={() => continueAnyway()}
          className="w-full rounded-2xl border border-slate-600 bg-slate-900/50 py-4 text-base font-medium text-slate-200"
        >
          Continue anyway
        </button>
      </div>
    </div>
  )
}

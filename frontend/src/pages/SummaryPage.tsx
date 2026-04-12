import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BillSplitMark } from '../components/BillSplitMark'
import { useBillSplit } from '../context/BillSplitContext'
import { formatIls, formatIlsWhole } from '../format'

export function SummaryPage() {
  const nav = useNavigate()
  const { calculateResult, resetSession } = useBillSplit()

  const sumRounded = useMemo(() => {
    if (!calculateResult) return 0
    return calculateResult.per_person.reduce((s, p) => s + p.total, 0)
  }, [calculateResult])

  if (!calculateResult) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <p className="text-slate-400">No result. Go back to split.</p>
        <button type="button" className="mt-4 text-emerald-400" onClick={() => nav('/assign')}>
          ← Split
        </button>
      </div>
    )
  }

  const { per_person, totals } = calculateResult

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="text-sm text-slate-400"
          onClick={() => nav('/assign')}
        >
          ← Edit
        </button>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
          <BillSplitMark className="h-7 w-7" />
          Summary
        </h1>
        <span className="w-10" />
      </header>

      <ul className="flex flex-col gap-4">
        {per_person.map((p) => (
          <li
            key={p.person_id}
            className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4"
          >
            <p className="font-medium text-white">{p.name}</p>
            <p className="mt-1 text-sm text-slate-400">
              {formatIls(p.subtotal)} + {formatIls(p.tip_amount)}
            </p>
            <p className="mt-3 text-xl font-bold text-emerald-400">
              To pay: {formatIlsWhole(p.total)}
            </p>
          </li>
        ))}
      </ul>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 text-sm text-slate-300">
        <div className="flex justify-between py-1">
          <span>Bill (before tip)</span>
          <span>{formatIls(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span>Tip</span>
          <span>{formatIls(totals.tip)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-slate-700 pt-2 font-medium text-white">
          <span>Total (bill + tip)</span>
          <span>{formatIls(totals.grand)}</span>
        </div>
        <div className="mt-3 flex justify-between text-slate-400">
          <span>Sum of rounded-up amounts (whole ₪ per person)</span>
          <span>{formatIlsWhole(sumRounded)}</span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Each person is rounded up to the nearest whole shekel; the sum of rounded amounts may be slightly above the exact bill.
        </p>
      </section>

      <button
        type="button"
        className="rounded-2xl border border-slate-700 py-3 text-slate-300"
        onClick={() => {
          resetSession()
          nav('/')
        }}
      >
        New bill
      </button>
    </div>
  )
}

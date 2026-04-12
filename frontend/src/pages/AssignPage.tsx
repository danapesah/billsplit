import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { calculateSplit } from '../api'
import { BillSplitMark } from '../components/BillSplitMark'
import { useBillSplit } from '../context/BillSplitContext'
import { formatIls } from '../format'
import { computeReceiptLineSums, shouldShowReceiptMismatch } from '../receiptTotals'
import type { LineItem } from '../types'

function newId(): string {
  return crypto.randomUUID()
}

export function AssignPage() {
  const nav = useNavigate()
  const {
    lineItems,
    setLineItems,
    people,
    setPeople,
    assignments,
    setAssignments,
    tipPercent,
    setTipPercent,
    receiptTotal,
    setCalculateResult,
  } = useBillSplit()

  const [nameDraft, setNameDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Only one field is editable at a time; default is display-only to avoid accidental edits. */
  const [editingDescriptionLineId, setEditingDescriptionLineId] = useState<string | null>(
    null,
  )
  const [editingAmountLineId, setEditingAmountLineId] = useState<string | null>(null)

  /** Previous people ids (for syncing shared_fee lines when the roster grows/shrinks). */
  const prevPeopleIdsRef = useRef<string[]>([])

  const { linesSum } = useMemo(() => computeReceiptLineSums(lineItems), [lineItems])
  const showReceiptMismatch = useMemo(
    () => shouldShowReceiptMismatch(lineItems, receiptTotal),
    [lineItems, receiptTotal],
  )

  useEffect(() => {
    const allIds = people.map((p) => p.id)
    const prevIds = prevPeopleIdsRef.current
    const idSet = new Set(allIds)

    setAssignments((prevAssign) => {
      const next = { ...prevAssign }
      let changed = false

      for (const li of lineItems) {
        if (li.line_kind !== 'shared_fee') continue

        let cur = next[li.id]
        if (cur === undefined) {
          if (allIds.length > 0) {
            next[li.id] = [...allIds]
            changed = true
          }
          continue
        }

        const filtered = cur.filter((id) => idSet.has(id))
        if (filtered.length !== cur.length) {
          cur = filtered
          next[li.id] = cur
          changed = true
        }

        const hadFullPreviousRoster =
          prevIds.length > 0 &&
          prevIds.every((id) => cur.includes(id)) &&
          cur.length === prevIds.length
        if (hadFullPreviousRoster && allIds.length > prevIds.length) {
          next[li.id] = [...allIds]
          changed = true
        }
      }

      return changed ? next : prevAssign
    })

    prevPeopleIdsRef.current = allIds
  }, [lineItems, people, setAssignments])

  function addPerson() {
    const name = nameDraft.trim()
    if (!name) return
    const exists = people.some((p) => p.name.toLowerCase() === name.toLowerCase())
    if (exists) {
      setNameDraft('')
      return
    }
    setPeople([...people, { id: newId(), name }])
    setNameDraft('')
  }

  function removePerson(id: string) {
    setPeople(people.filter((p) => p.id !== id))
    const next = { ...assignments }
    for (const key of Object.keys(next)) {
      next[key] = next[key].filter((pid) => pid !== id)
    }
    setAssignments(next)
  }

  function updateLine(id: string, field: keyof LineItem, value: string | number) {
    setLineItems(
      lineItems.map((li) => (li.id === id ? { ...li, [field]: value } : li)),
    )
  }

  function removeLine(id: string) {
    setLineItems(lineItems.filter((l) => l.id !== id))
    const next = { ...assignments }
    delete next[id]
    setAssignments(next)
  }

  /** Replace one line of quantity N with N lines (qty 1 each), splitting amount evenly in agorot. */
  function splitLineIntoUnitLines(lineId: string) {
    const idx = lineItems.findIndex((l) => l.id === lineId)
    if (idx === -1) return
    const li = lineItems[idx]
    if (li.line_kind === 'discount' || li.quantity <= 1) return

    const n = li.quantity
    const totalAgorot = Math.round(Number(li.amount) * 100)
    const base = Math.floor(totalAgorot / n)
    const rem = totalAgorot % n
    const amounts = Array.from(
      { length: n },
      (_, i) => (base + (i < rem ? 1 : 0)) / 100,
    )

    const newLines: LineItem[] = amounts.map((amount) => ({
      id: newId(),
      description: li.description,
      amount,
      quantity: 1,
      line_kind: li.line_kind,
    }))

    setLineItems([...lineItems.slice(0, idx), ...newLines, ...lineItems.slice(idx + 1)])

    const origAssign = assignments[lineId] ?? []
    const nextAssign = { ...assignments }
    delete nextAssign[lineId]
    for (const nl of newLines) {
      nextAssign[nl.id] = [...origAssign]
    }
    setAssignments(nextAssign)

    setEditingDescriptionLineId(null)
    setEditingAmountLineId(null)
  }

  function togglePersonForLine(lineId: string, personId: string) {
    const current = assignments[lineId] ?? []
    const next = current.includes(personId)
      ? current.filter((id) => id !== personId)
      : [...current, personId]
    setAssignments({ ...assignments, [lineId]: next })
  }

  function selectAllForLine(lineId: string) {
    setAssignments({
      ...assignments,
      [lineId]: people.map((p) => p.id),
    })
  }

  function clearLine(lineId: string) {
    setAssignments({ ...assignments, [lineId]: [] })
  }

  const canCalculate =
    people.length > 0 &&
    lineItems.length > 0 &&
    lineItems.every(
      (li) =>
        li.line_kind === 'discount' ||
        li.line_kind === 'shared_fee' ||
        (assignments[li.id]?.length ?? 0) > 0,
    )

  async function onCalculate() {
    if (!canCalculate) return
    setError(null)
    setLoading(true)
    try {
      const body = {
        line_items: lineItems.map((li) => ({
          id: li.id,
          description: li.description,
          amount: Number(li.amount),
          quantity: li.quantity,
          line_kind: li.line_kind,
        })),
        assignments: lineItems.map((li) => ({
          line_item_id: li.id,
          person_ids: assignments[li.id] ?? [],
        })),
        tip_percent: tipPercent,
        people,
      }
      const res = await calculateSplit(body)
      setCalculateResult(res)
      nav('/summary')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Calculation failed')
    } finally {
      setLoading(false)
    }
  }

  if (lineItems.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <p className="text-slate-400">No line items. Go back to upload.</p>
        <button
          type="button"
          className="mt-4 text-emerald-400"
          onClick={() => nav('/')}
        >
          ← New bill
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-6 pb-[calc(10rem+env(safe-area-inset-bottom,0px))]">
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="text-sm text-slate-400"
          onClick={() => nav('/')}
        >
          ← Back
        </button>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
          <BillSplitMark className="h-7 w-7" />
          Split
        </h1>
        <span className="w-10" />
      </header>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-400">People</h2>
        <div className="flex flex-wrap gap-2">
          {people.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-200"
            >
              {p.name}
              <button
                type="button"
                className="ml-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-sm leading-none text-slate-500 hover:text-red-400"
                onClick={() => removePerson(p.id)}
                aria-label={`Remove ${p.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-600"
            placeholder="Name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPerson()}
          />
          <button
            type="button"
            className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
            onClick={addPerson}
          >
            Add
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-400">Items</h2>
        <ul className="flex flex-col gap-4 overflow-visible pt-1">
          {lineItems.map((li) => {
            const assigned = assignments[li.id] ?? []
            const isShared = li.line_kind === 'shared_fee'
            const isDiscount = li.line_kind === 'discount'
            return (
              <li
                key={li.id}
                className={
                  isDiscount
                    ? 'relative overflow-visible rounded-2xl border border-violet-900/50 bg-violet-950/30 p-4 pr-10'
                    : isShared
                      ? 'relative overflow-visible rounded-2xl border border-amber-900/45 bg-amber-950/25 p-4 pr-10'
                      : 'relative overflow-visible rounded-2xl border border-slate-800 bg-slate-900/40 p-4 pr-10'
                }
              >
                <button
                  type="button"
                  className="absolute -right-3.5 -top-3.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-red-500/70 bg-slate-950 text-base font-light leading-none text-red-500 shadow-md hover:border-red-400 hover:bg-red-950/60 hover:text-red-400"
                  onClick={() => removeLine(li.id)}
                  aria-label="Delete line"
                >
                  ×
                </button>
                {isDiscount && (
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-violet-200/85">
                    Discount (split evenly — not assigned)
                  </p>
                )}
                {isShared && (
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-200/80">
                    Receipt detail (tax / service / fee) — not added again; your items already
                    include these.
                  </p>
                )}
                <div className="flex items-start gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <span
                        className="rounded-lg bg-slate-800/90 px-2.5 py-1.5 text-xs font-medium tabular-nums text-slate-200"
                        aria-label={`Quantity ${li.quantity}`}
                      >
                        ×{li.quantity}
                      </span>
                      {li.quantity > 1 && !isDiscount && (
                        <button
                          type="button"
                          className="rounded-md px-1.5 py-1 text-xs text-emerald-400/95 underline decoration-emerald-600/50 underline-offset-2 hover:text-emerald-300 hover:decoration-emerald-400/70"
                          onClick={() => splitLineIntoUnitLines(li.id)}
                          aria-label={`Split into ${li.quantity} separate lines for assignment`}
                        >
                          Split into {li.quantity} lines
                        </button>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      {editingDescriptionLineId === li.id ? (
                        <input
                          className="min-w-0 flex-1 rounded-lg border border-emerald-600/50 bg-slate-950 px-2 py-1.5 text-sm ring-1 ring-emerald-600/30"
                          value={li.description}
                          autoFocus
                          onChange={(e) =>
                            updateLine(li.id, 'description', e.target.value)
                          }
                          onBlur={() => setEditingDescriptionLineId(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Escape') {
                              e.currentTarget.blur()
                            }
                          }}
                          aria-label="Description"
                        />
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 break-words px-2 py-1.5 text-sm text-slate-200">
                            {li.description.trim() ? li.description : (
                              <span className="text-slate-500 italic">No description</span>
                            )}
                          </span>
                          <button
                            type="button"
                            className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-500 underline decoration-slate-600 underline-offset-2 hover:text-emerald-400 hover:decoration-emerald-500/60"
                            onClick={() => {
                              setEditingAmountLineId(null)
                              setEditingDescriptionLineId(li.id)
                            }}
                            aria-label="Edit description"
                          >
                            Edit
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {editingAmountLineId === li.id ? (
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.01}
                        className="w-24 rounded-lg border border-emerald-600/50 bg-slate-950 px-2 py-1.5 text-sm text-right ring-1 ring-emerald-600/30"
                        value={li.amount}
                        autoFocus
                        onChange={(e) =>
                          updateLine(li.id, 'amount', parseFloat(e.target.value) || 0)
                        }
                        onBlur={() => setEditingAmountLineId(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            e.currentTarget.blur()
                          }
                        }}
                        aria-label="Amount (₪)"
                      />
                    ) : (
                      <span
                        className={
                          isDiscount
                            ? 'min-w-[4.5rem] px-1 py-1.5 text-right text-sm tabular-nums text-violet-200'
                            : 'min-w-[4.5rem] px-1 py-1.5 text-right text-sm tabular-nums text-slate-200'
                        }
                        aria-label={`Amount ${li.amount} shekels`}
                      >
                        {isDiscount ? '−' : ''}
                        {Number(li.amount).toLocaleString(undefined, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    )}
                    <span className="text-slate-500">₪</span>
                    {editingAmountLineId !== li.id && (
                      <button
                        type="button"
                        className="shrink-0 rounded-md px-1 py-1 text-xs text-slate-500 underline decoration-slate-600 underline-offset-2 hover:text-emerald-400 hover:decoration-emerald-500/60"
                        onClick={() => {
                          setEditingDescriptionLineId(null)
                          setEditingAmountLineId(li.id)
                        }}
                        aria-label="Edit amount"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
                {!isDiscount && (
                  <>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={
                          isShared
                            ? 'rounded-lg bg-amber-950/80 px-2 py-1 text-xs text-amber-100 ring-1 ring-amber-800/50 hover:bg-amber-900/60'
                            : 'rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-300'
                        }
                        onClick={() => selectAllForLine(li.id)}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className={
                          isShared
                            ? 'rounded-lg bg-amber-950/80 px-2 py-1 text-xs text-amber-100 ring-1 ring-amber-800/50 hover:bg-amber-900/60'
                            : 'rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-300'
                        }
                        onClick={() => clearLine(li.id)}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Who pays">
                      {people.length === 0 ? (
                        <p className="text-sm text-slate-500">Add people above</p>
                      ) : (
                        people.map((p) => {
                          const on = assigned.includes(p.id)
                          return (
                            <button
                              key={p.id}
                              type="button"
                              aria-pressed={on}
                              onClick={() => togglePersonForLine(li.id, p.id)}
                              className={
                                on
                                  ? isShared
                                    ? 'rounded-full border border-emerald-400/80 bg-emerald-600/55 px-3 py-1.5 text-sm font-semibold text-white shadow-md shadow-emerald-950/40 ring-2 ring-emerald-400/35'
                                    : 'rounded-full border border-emerald-600/60 bg-emerald-950/50 px-3 py-1.5 text-sm font-medium text-emerald-200 shadow-sm shadow-emerald-900/20'
                                  : isShared
                                    ? 'rounded-full border border-amber-900/50 bg-amber-950/20 px-3 py-1.5 text-sm text-amber-200/70 hover:border-amber-700/60 hover:text-amber-100'
                                    : 'rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-400 hover:border-slate-600 hover:text-slate-300'
                              }
                            >
                              {p.name}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </>
                )}
                {isDiscount && (
                  <p className="mt-3 text-sm text-violet-200/75">
                    Subtracted equally from everyone (no payer selection).
                  </p>
                )}
              </li>
            )
          })}
        </ul>
        <button
          type="button"
          className="mt-3 text-sm text-emerald-400"
          onClick={() =>
            setLineItems([
              ...lineItems,
              {
                id: newId(),
                description: 'Item',
                amount: 0,
                quantity: 1,
                line_kind: 'ordered',
              },
            ])
          }
        >
          + Add line
        </button>
      </section>

      {receiptTotal != null && (
        <section className="rounded-2xl border border-slate-700/80 bg-slate-900/50 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm text-slate-400">Receipt total</span>
            <span className="text-lg font-semibold tabular-nums text-white">
              {formatIls(receiptTotal)}
            </span>
          </div>
          {showReceiptMismatch && (
            <>
              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-sm text-slate-400">
                <span>Sum of line items</span>
                <span className="tabular-nums text-slate-300">{formatIls(linesSum)}</span>
              </div>
              <p className="mt-2 text-xs text-amber-200/90">
                These totals differ — edit lines, or go back and take a clearer photo of the bill.
              </p>
            </>
          )}
        </section>
      )}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-400">Tip (%)</h2>
          <span className="text-lg font-semibold text-emerald-400">{tipPercent}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={30}
          step={1}
          value={tipPercent}
          onChange={(e) => setTipPercent(Number(e.target.value))}
          className="mt-2 w-full accent-emerald-500"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {[10, 12, 15, 18, 20].map((p) => (
            <button
              key={p}
              type="button"
              className="rounded-lg bg-slate-800 px-3 py-1 text-xs text-slate-300"
              onClick={() => setTipPercent(p)}
            >
              {p}%
            </button>
          ))}
        </div>
      </section>

      {error && (
        <p className="rounded-lg bg-red-950/80 px-3 py-2 text-sm text-red-200">{error}</p>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] backdrop-blur">
        <button
          type="button"
          disabled={!canCalculate || loading}
          onClick={() => void onCalculate()}
          className="w-full rounded-2xl bg-emerald-600 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-900/30 disabled:opacity-40"
        >
          {loading ? 'Calculating…' : 'Calculate'}
        </button>
        {!canCalculate && (
          <p className="mt-2 text-center text-xs text-slate-500">
            Add people and assign payers for each item line (discount and receipt-detail
            lines are automatic).
          </p>
        )}
      </div>
    </div>
  )
}

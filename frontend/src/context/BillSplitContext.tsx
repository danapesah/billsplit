import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type SetStateAction,
} from 'react'
import type { CalculateResponse, LineItem, Person } from '../types'
import { normalizeLineItem } from '../types'
import { loadSavedPeople, loadSession, savePeople, saveSession, clearSession } from '../storage'

export interface BillSplitState {
  lineItems: LineItem[]
  people: Person[]
  assignments: Record<string, string[]>
  tipPercent: number
  /** Total printed on the receipt (ILS), when known from parsing. */
  receiptTotal: number | null
  calculateResult: CalculateResponse | null
  setLineItems: (items: LineItem[]) => void
  setPeople: (p: Person[]) => void
  setAssignments: (a: SetStateAction<Record<string, string[]>>) => void
  setTipPercent: (n: number) => void
  setReceiptTotal: (n: number | null) => void
  setCalculateResult: (r: CalculateResponse | null) => void
  resetSession: () => void
}

const BillSplitContext = createContext<BillSplitState | null>(null)

export function BillSplitProvider({ children }: { children: ReactNode }) {
  const [lineItems, setLineItemsState] = useState<LineItem[]>([])
  const [people, setPeopleState] = useState<Person[]>(() => loadSavedPeople())
  const [assignments, setAssignmentsState] = useState<Record<string, string[]>>({})
  const [tipPercent, setTipPercentState] = useState(15)
  const [receiptTotal, setReceiptTotalState] = useState<number | null>(null)
  const [calculateResult, setCalculateResult] = useState<CalculateResponse | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const s = loadSession()
    if (s) {
      setLineItemsState(s.lineItems.map((li) => normalizeLineItem(li)))
      setAssignmentsState(s.assignments)
      setTipPercentState(s.tipPercent)
      if (s.calculateResult) setCalculateResult(s.calculateResult)
      if (s.receiptTotal !== undefined) setReceiptTotalState(s.receiptTotal)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    saveSession({
      lineItems,
      assignments,
      tipPercent,
      calculateResult,
      receiptTotal,
    })
  }, [lineItems, assignments, tipPercent, calculateResult, receiptTotal, hydrated])

  useEffect(() => {
    savePeople(people)
  }, [people])

  const setLineItems = useCallback((items: LineItem[]) => {
    setLineItemsState(items)
    setCalculateResult(null)
  }, [])

  const setPeople = useCallback((p: Person[]) => {
    setPeopleState(p)
  }, [])

  const setAssignments = useCallback((a: SetStateAction<Record<string, string[]>>) => {
    setAssignmentsState((prev) => (typeof a === 'function' ? a(prev) : a))
    setCalculateResult(null)
  }, [])

  const setTipPercent = useCallback((n: number) => {
    setTipPercentState(n)
    setCalculateResult(null)
  }, [])

  const setReceiptTotal = useCallback((n: number | null) => {
    setReceiptTotalState(n)
  }, [])

  const resetSession = useCallback(() => {
    setLineItemsState([])
    setAssignmentsState({})
    setTipPercentState(15)
    setReceiptTotalState(null)
    setCalculateResult(null)
    clearSession()
  }, [])

  const value = useMemo(
    () =>
      ({
        lineItems,
        people,
        assignments,
        tipPercent,
        receiptTotal,
        calculateResult,
        setLineItems,
        setPeople,
        setAssignments,
        setTipPercent,
        setReceiptTotal,
        setCalculateResult,
        resetSession,
      }) satisfies BillSplitState,
    [
      lineItems,
      people,
      assignments,
      tipPercent,
      receiptTotal,
      calculateResult,
      setLineItems,
      setPeople,
      setAssignments,
      setTipPercent,
      setReceiptTotal,
      resetSession,
    ],
  )

  return <BillSplitContext.Provider value={value}>{children}</BillSplitContext.Provider>
}

export function useBillSplit(): BillSplitState {
  const ctx = useContext(BillSplitContext)
  if (!ctx) throw new Error('useBillSplit must be used within BillSplitProvider')
  return ctx
}

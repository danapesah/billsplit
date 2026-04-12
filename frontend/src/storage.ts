import type { CalculateResponse, LineItem, Person } from './types'

export const PEOPLE_KEY = 'billsplit_people'

const SESSION_KEY = 'billsplit_session'

export interface BillSession {
  lineItems: LineItem[]
  assignments: Record<string, string[]>
  tipPercent: number
  calculateResult?: CalculateResponse | null
  receiptTotal?: number | null
}

export function loadSavedPeople(): Person[] {
  try {
    const raw = localStorage.getItem(PEOPLE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p): p is Person =>
        p && typeof p === 'object' && 'id' in p && 'name' in p && typeof (p as Person).name === 'string',
    )
  } catch {
    return []
  }
}

export function savePeople(people: Person[]): void {
  localStorage.setItem(PEOPLE_KEY, JSON.stringify(people))
}

export function loadSession(): BillSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as BillSession
  } catch {
    return null
  }
}

export function saveSession(s: BillSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

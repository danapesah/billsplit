import type { CalculateResponse, LineItem, ParseResponse, Person } from './types'

/** Same origin in production (Docker/EC2); dev default unless `VITE_API_URL` is set. */
const base = () =>
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')

export async function parseBillImage(file: File): Promise<ParseResponse> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${base()}/api/bills/parse`, {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? res.statusText)
  }
  return res.json() as Promise<ParseResponse>
}

export interface CalculateBody {
  line_items: LineItem[]
  assignments: { line_item_id: string; person_ids: string[] }[]
  tip_percent: number
  people: Person[]
}

export async function calculateSplit(body: CalculateBody): Promise<CalculateResponse> {
  const res = await fetch(`${base()}/api/splits/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? res.statusText)
  }
  return res.json() as Promise<CalculateResponse>
}

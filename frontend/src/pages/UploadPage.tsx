import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseBillImage } from '../api'
import { BillSplitMark } from '../components/BillSplitMark'
import { useBillSplit } from '../context/BillSplitContext'
import { shouldShowReceiptMismatch } from '../receiptTotals'
import { normalizeLineItem } from '../types'

export function UploadPage() {
  const nav = useNavigate()
  const { setLineItems, resetSession, setReceiptTotal } = useBillSplit()
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File | null) {
    if (!file) return
    setError(null)
    setLoading(true)
    try {
      resetSession()
      const res = await parseBillImage(file)
      const rt =
        res.receipt_total != null && Number.isFinite(res.receipt_total)
          ? res.receipt_total
          : null
      setReceiptTotal(rt)
      const items = res.items.map((i) => normalizeLineItem(i))
      setLineItems(items)
      if (shouldShowReceiptMismatch(items, rt)) {
        nav('/receipt-mismatch')
      } else {
        nav('/assign')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex items-start gap-3">
        <BillSplitMark className="h-11 w-11 shrink-0 drop-shadow-md" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">BillSplit</h1>
          <p className="mt-1 text-sm text-slate-400">Upload a photo of your bill — amounts in ₪</p>
        </div>
      </header>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-600 bg-slate-900/50 px-4 py-8 text-center transition hover:border-emerald-500/60 hover:bg-slate-900 disabled:opacity-60"
      >
        <span className="text-4xl" aria-hidden>
          📄
        </span>
        <span className="mt-3 font-medium text-slate-200">
          {loading ? 'Processing…' : 'Tap to choose a bill photo'}
        </span>
        <span className="mt-1 text-sm text-slate-500">JPEG / PNG / WebP</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className="rounded-xl bg-slate-800 py-3 text-sm font-medium text-slate-200"
          onClick={() => {
            const i = document.createElement('input')
            i.type = 'file'
            i.accept = 'image/*'
            i.capture = 'environment'
            i.onchange = () => void handleFile(i.files?.[0] ?? null)
            i.click()
          }}
        >
          Camera
        </button>
        <button
          type="button"
          className="rounded-xl bg-slate-800 py-3 text-sm font-medium text-slate-200"
          onClick={() => inputRef.current?.click()}
        >
          Gallery
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-950/80 px-3 py-2 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

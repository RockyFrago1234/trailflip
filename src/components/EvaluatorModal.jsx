import { useEffect, useRef, useState } from 'react'
import { Close } from './icons'
import { currency } from '../utils/format'
import { fileToResizedDataURL } from '../lib/resizeImage'

const clamp = (s) => Math.max(0, Math.min(100, Number(s) || 0))

function scoreColor(s) {
  if (s >= 70) return 'bg-forest-600'
  if (s >= 45) return 'bg-trail-500'
  return 'bg-rose-500'
}

function Row({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  )
}

function Bullets({ title, items }) {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
        {items.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </div>
  )
}

function EvaluationResult({ result: r }) {
  const score = clamp(r.deal_score)
  const title = [r.brand, r.model].filter(Boolean).join(' ') || 'Unidentified gear'
  const hasUsed = r.used_low_usd != null || r.used_high_usd != null
  const subtitle = [r.category, r.year, r.confidence ? `${r.confidence} confidence` : null].filter(Boolean).join(' · ')

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">{title}</h3>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
          <div className="shrink-0 text-center">
            <div className={`grid h-14 w-14 place-items-center rounded-2xl text-xl font-extrabold text-white ${scoreColor(score)}`}>
              {score}
            </div>
            <p className="mt-1 text-[11px] font-medium text-slate-500">flip score</p>
          </div>
        </div>
        {r.verdict && (
          <p className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{r.verdict}</p>
        )}
        {r.summary && <p className="mt-3 text-sm leading-relaxed text-slate-700">{r.summary}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 p-4">
        <Row label="MSRP (new)" value={r.msrp_usd != null ? currency(r.msrp_usd) : null} />
        <Row label="Typical used value" value={hasUsed ? `${currency(r.used_low_usd)} – ${currency(r.used_high_usd)}` : null} />
        <Row label="Listed price" value={r.listed_price_usd != null ? currency(r.listed_price_usd) : null} />
        <Row label="Est. profit potential" value={r.estimated_profit_usd != null ? `+${currency(r.estimated_profit_usd)}` : null} />
      </div>

      {Array.isArray(r.ratings) && r.ratings.length > 0 && (
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">⭐ Ratings</p>
          <div className="mt-3 space-y-3">
            {r.ratings.map((rt, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{rt.label}</span>
                  <span className="font-bold text-slate-900">{clamp(rt.score)}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full ${scoreColor(clamp(rt.score))}`} style={{ width: `${clamp(rt.score)}%` }} />
                </div>
                {rt.note && <p className="mt-1 text-xs text-slate-500">{rt.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <Bullets title="📋 Details" items={r.key_details} />
      <Bullets title="🔧 Common issues to check" items={r.common_issues} />
      <Bullets title="🔍 Before you buy" items={r.inspection_tips} />

      {r.manufacturer_url && (
        <a
          href={r.manufacturer_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          View on manufacturer&apos;s site ↗
        </a>
      )}
    </div>
  )
}

export default function EvaluatorModal({ onClose }) {
  const [mode, setMode] = useState('image') // 'image' | 'url'
  const [image, setImage] = useState(null)
  const [url, setUrl] = useState('')
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const inputRef = useRef(null)

  async function handleFile(file) {
    setError('')
    try {
      const dataUrl = await fileToResizedDataURL(file)
      setImage(dataUrl)
      setResult(null)
    } catch {
      setError('Could not read that image — try a PNG or JPG.')
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  // Paste a screenshot straight in (Win+Shift+S → Ctrl+V)
  useEffect(() => {
    async function onPaste(e) {
      if (mode !== 'image') return
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (file) await handleFile(file)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [mode])

  const canSubmit = mode === 'image' ? !!image : /^https?:\/\/.+/i.test(url.trim())

  async function evaluate() {
    if (!canSubmit || loading) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const payload =
        mode === 'image'
          ? { image, price: price || null, note: note || null }
          : { url: url.trim(), price: price || null, note: note || null }
      const resp = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Evaluation failed.')
      setResult(data.evaluation)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setImage(null)
    setUrl('')
    setResult(null)
    setError('')
    setPrice('')
    setNote('')
  }

  const fieldCls =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-forest-400 focus:bg-white focus:ring-2 focus:ring-forest-100'
  const tabCls = (active) =>
    `flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
      active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
    }`

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="animate-pop-in flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">✨ AI Deal Evaluator</h2>
            <p className="text-sm text-slate-500">Screenshot or listing URL → model, MSRP, issues, ratings &amp; a flip score.</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100"
            aria-label="Close"
          >
            <Close />
          </button>
        </div>

        <div className="grid gap-4 overflow-y-auto px-5 py-5">
          {!result && (
            <div className="flex gap-1 rounded-full bg-slate-100 p-1">
              <button className={tabCls(mode === 'image')} onClick={() => setMode('image')}>📷 Screenshot</button>
              <button className={tabCls(mode === 'url')} onClick={() => setMode('url')}>🔗 Listing URL</button>
            </div>
          )}

          {!result && mode === 'image' && (
            !image ? (
              <button
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const f = e.dataTransfer.files?.[0]
                  if (f) handleFile(f)
                }}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition hover:border-forest-400 hover:bg-forest-50"
              >
                <span className="text-4xl">🖼️</span>
                <span className="font-semibold text-slate-700">Click to upload, drag a photo, or paste a screenshot</span>
                <span className="text-xs text-slate-500">PNG, JPG or WebP — a Facebook / Craigslist screenshot works great</span>
              </button>
            ) : (
              <div className="relative overflow-hidden rounded-2xl border border-slate-200">
                <img src={image} alt="Gear to evaluate" className="max-h-72 w-full bg-slate-100 object-contain" />
                <button
                  onClick={() => setImage(null)}
                  className="absolute right-2 top-2 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow transition hover:bg-white"
                >
                  Change
                </button>
              </div>
            )
          )}

          {!result && mode === 'url' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Listing URL</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.ebay.com/itm/…  or a Craigslist link"
                className={fieldCls}
                autoFocus
              />
              <p className="mt-1 text-xs text-slate-500">eBay &amp; Craigslist work best. Facebook blocks bots — use a screenshot for those.</p>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />

          {!result && canSubmit && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Asking price (optional)</label>
                <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 700" className={fieldCls} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Note (optional)</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="anything else worth knowing" className={fieldCls} />
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-3 py-6 text-slate-500">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-forest-600" />
              <span className="text-sm">Scrubbing the listing and pricing it up… (~10–25s)</span>
            </div>
          )}

          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          {result && <EvaluationResult result={result} />}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
          <p className="hidden text-xs text-slate-400 sm:block">AI estimates — always inspect in person before buying.</p>
          {result ? (
            <button onClick={reset} className="ml-auto rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
              Evaluate another
            </button>
          ) : (
            <button
              onClick={evaluate}
              disabled={!canSubmit || loading}
              className="ml-auto rounded-full bg-forest-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? 'Analyzing…' : 'Evaluate deal'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

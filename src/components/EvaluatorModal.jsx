import { useEffect, useRef, useState } from 'react'
import { Close } from './icons'
import EvaluationReport from './EvaluationReport'
import { fileToResizedDataURL } from '../lib/resizeImage'
import { useAuth } from '../context/AuthProvider'
import { createItem, fieldsFromEvaluation, makeMatchKey, uploadListingPhotos, STATUS_META } from '../lib/items'

export default function EvaluatorModal({ onClose, onSaved, findMatches, onGoToCatalogue }) {
  const { user } = useAuth()
  const [mode, setMode] = useState('image') // 'image' | 'url'
  const [image, setImage] = useState(null)
  const [url, setUrl] = useState('')
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [saving, setSaving] = useState('')
  const [savedItem, setSavedItem] = useState(null)
  const inputRef = useRef(null)

  const matches = result && findMatches ? findMatches(makeMatchKey(result.brand, result.model, result.year)) : []

  async function handleFile(file) {
    setError('')
    try {
      const dataUrl = await fileToResizedDataURL(file)
      setImage(dataUrl)
      setResult(null)
      setSavedItem(null)
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
    setSavedItem(null)
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

  async function save(status) {
    if (!user || !result || savedItem) return
    setSaving(status)
    setError('')
    try {
      let photos = []
      if (image) photos = await uploadListingPhotos(user.id, [image])
      const fields = fieldsFromEvaluation(result, {
        status,
        askingPrice: price ? Number(price) : null,
        sourceUrl: mode === 'url' ? url.trim() : null,
      })
      if (photos.length) fields.photos = photos
      const item = await createItem(user.id, fields)
      setSavedItem(item)
      onSaved?.(item)
    } catch (e) {
      setError(e.message || 'Could not save to your catalogue.')
    } finally {
      setSaving('')
    }
  }

  function reset() {
    setImage(null)
    setUrl('')
    setResult(null)
    setSavedItem(null)
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
            <h2 className="text-lg font-extrabold text-slate-900">✨ Scan a deal</h2>
            <p className="text-sm text-slate-500">Snap a real item or a listing screenshot → model, value, issues &amp; a flip score.</p>
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
              <button className={tabCls(mode === 'image')} onClick={() => setMode('image')}>📷 Photo / screenshot</button>
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
                <span className="font-semibold text-slate-700">Snap a photo, upload, drag, or paste</span>
                <span className="text-xs text-slate-500">A garage-sale / thrift find or a Facebook / Craigslist screenshot — both work great</span>
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
              <span className="text-sm">Identifying it and pricing it up… (~10–25s)</span>
            </div>
          )}

          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          {/* You've scanned this before */}
          {result && !savedItem && matches.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              👀 You’ve scanned this before — <b>{matches[0].title}</b> is already in your catalogue
              {STATUS_META[matches[0].status] ? ` (${STATUS_META[matches[0].status].label})` : ''}.
              {onGoToCatalogue && (
                <button onClick={onGoToCatalogue} className="ml-1 font-bold underline">Open catalogue</button>
              )}
            </div>
          )}

          {savedItem && (
            <div className="rounded-xl border border-forest-200 bg-forest-50 px-3 py-2.5 text-sm font-medium text-forest-800">
              ✅ Saved to your {STATUS_META[savedItem.status]?.label || 'catalogue'} folder.
              {onGoToCatalogue && (
                <button onClick={onGoToCatalogue} className="ml-1 font-bold underline">View it</button>
              )}
            </div>
          )}

          {result && <EvaluationReport result={result} />}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
          {result ? (
            <>
              <button onClick={reset} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
                Scan another
              </button>
              {!savedItem && (
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => save('wishlist')}
                    disabled={!!saving}
                    className="rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-200 disabled:opacity-50"
                  >
                    {saving === 'wishlist' ? 'Saving…' : '⭐ Wishlist'}
                  </button>
                  <button
                    onClick={() => save('prospect')}
                    disabled={!!saving}
                    className="rounded-full bg-forest-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest-700 disabled:opacity-50"
                  >
                    {saving === 'prospect' ? 'Saving…' : '🔍 Save to Prospects'}
                  </button>
                </div>
              )}
            </>
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

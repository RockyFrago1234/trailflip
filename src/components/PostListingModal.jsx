import { useEffect, useRef, useState } from 'react'
import { Close } from './icons'
import { CONDITIONS, getCategory } from '../data/listings'
import { currency } from '../utils/format'
import { useAuth } from '../context/AuthProvider'
import { fileToResizedDataURL } from '../lib/resizeImage'
import { uploadListingPhotos } from '../lib/uploadPhotos'

const FIELD =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-forest-400 focus:bg-white focus:ring-2 focus:ring-forest-100'

function Label({ children }) {
  return <label className="mb-1 block text-sm font-medium text-slate-700">{children}</label>
}

export default function PostListingModal({ categories, onClose, onSubmit }) {
  const { user } = useAuth()
  const inputRef = useRef(null)

  const [photos, setPhotos] = useState([]) // resized data URLs
  const [form, setForm] = useState({
    title: '',
    category: categories[0].id,
    type: 'sale',
    price: '',
    condition: 'Good',
    location: '',
    description: '',
    repairs: '',
    tradeFor: '',
  })
  const [est, setEst] = useState({ msrp: null, low: null, high: null, suggested: null })
  const [drafting, setDrafting] = useState(false)
  const [drafted, setDrafted] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !posting) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, posting])

  async function addFiles(files) {
    setError('')
    const incoming = [...files].slice(0, 6 - photos.length)
    for (const file of incoming) {
      try {
        const dataUrl = await fileToResizedDataURL(file, 1400, 0.85)
        setPhotos((p) => (p.length >= 6 ? p : [...p, dataUrl]))
      } catch {
        setError('Could not read one of those images.')
      }
    }
  }

  async function autoFill() {
    if (!photos.length || drafting) return
    setDrafting(true)
    setError('')
    try {
      const resp = await fetch('/api/draft-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: photos.slice(0, 4) }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Auto-fill failed.')
      const d = data.draft
      const category = categories.some((c) => c.id === d.category) ? d.category : 'other'
      setForm((f) => ({
        ...f,
        title: d.title || f.title,
        category,
        type: d.trade_for ? 'both' : f.type,
        condition: CONDITIONS.includes(d.condition) ? d.condition : f.condition,
        description: d.description || f.description,
        repairs: d.repairs || '',
        tradeFor: d.trade_for || f.tradeFor,
        price: d.suggested_price_usd != null ? String(d.suggested_price_usd) : f.price,
      }))
      setEst({
        msrp: d.msrp_usd ?? null,
        low: d.used_low_usd ?? null,
        high: d.used_high_usd ?? null,
        suggested: d.suggested_price_usd ?? null,
      })
      setDrafted(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setDrafting(false)
    }
  }

  const isTradeOnly = form.type === 'trade'
  const canSubmit = form.title.trim() && (isTradeOnly || form.price) && !posting

  async function submit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setPosting(true)
    setError('')
    try {
      const urls = photos.length ? await uploadListingPhotos(user.id, photos) : []
      const description = form.repairs.trim()
        ? `${form.description.trim()}\n\nFlaws / repairs: ${form.repairs.trim()}`
        : form.description.trim() || 'No description provided.'
      await onSubmit({
        title: form.title.trim(),
        category: form.category,
        type: form.type,
        price: isTradeOnly ? null : Number(form.price) || null,
        estResale: est.high ?? est.suggested ?? null,
        condition: form.condition,
        location: form.location.trim() || 'Your area',
        emoji: getCategory(form.category).emoji,
        description,
        tradeFor: form.type !== 'sale' ? form.tradeFor.trim() : '',
        photos: urls,
      })
      // onSubmit closes the modal on success
    } catch (err) {
      setError(err.message || 'Could not post — please try again.')
      setPosting(false)
    }
  }

  const priceHint = est.suggested != null || est.msrp != null || est.high != null

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => !posting && onClose()}
    >
      <form
        onSubmit={submit}
        className="animate-pop-in flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">List an item</h2>
            <p className="text-sm text-slate-500">Add photos, hit ✨ auto-fill, glance over it, post. ~30 seconds.</p>
          </div>
          <button
            type="button"
            onClick={() => !posting && onClose()}
            className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100"
            aria-label="Close"
          >
            <Close />
          </button>
        </div>

        <div className="grid gap-4 overflow-y-auto px-5 py-5">
          {/* Photos */}
          <div>
            <Label>Photos {photos.length > 0 && <span className="text-slate-400">({photos.length}/6 · first is the cover)</span>}</Label>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200">
                  <img src={p} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                  {i === 0 && <span className="absolute bottom-0 left-0 right-0 bg-black/55 py-0.5 text-center text-[10px] font-semibold text-white">Cover</span>}
                  <button
                    type="button"
                    onClick={() => setPhotos((arr) => arr.filter((_, idx) => idx !== i))}
                    className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-xs text-slate-700 shadow"
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                </div>
              ))}
              {photos.length < 6 && (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
                  }}
                  className="grid h-20 w-20 place-items-center rounded-xl border-2 border-dashed border-slate-300 text-2xl text-slate-400 transition hover:border-forest-400 hover:text-forest-500"
                >
                  +
                </button>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files?.length && addFiles(e.target.files)}
            />
          </div>

          {/* Auto-fill */}
          {photos.length > 0 && (
            <button
              type="button"
              onClick={autoFill}
              disabled={drafting}
              className="flex items-center justify-center gap-2 rounded-xl bg-trail-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-trail-600 disabled:opacity-50"
            >
              {drafting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Writing your listing…
                </>
              ) : (
                <>✨ {drafted ? 'Re-write from photos' : 'Auto-fill from photos'}</>
              )}
            </button>
          )}
          {drafted && (
            <p className="-mt-2 rounded-lg bg-forest-50 px-3 py-2 text-xs font-medium text-forest-800">
              ✨ Drafted from your photos — review &amp; tweak below, then post.
            </p>
          )}

          <div>
            <Label>Title</Label>
            <input value={form.title} onChange={set('title')} placeholder="e.g. Santa Cruz Hightower — carbon, barely ridden" className={FIELD} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <select value={form.category} onChange={set('category')} className={FIELD}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Listing type</Label>
              <select value={form.type} onChange={set('type')} className={FIELD}>
                <option value="sale">For sale</option>
                <option value="both">Sale or trade</option>
                <option value="trade">Trade only</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{isTradeOnly ? 'Asking price (trade only)' : 'Price ($)'}</Label>
              <input type="number" min="0" value={form.price} onChange={set('price')} placeholder={isTradeOnly ? '—' : '700'} className={FIELD} disabled={isTradeOnly} />
              {priceHint && !isTradeOnly && (
                <p className="mt-1 text-xs text-slate-500">
                  {est.suggested != null && <span className="font-semibold text-forest-700">✨ Suggested {currency(est.suggested)}</span>}
                  {est.msrp != null && <span> · MSRP ~{currency(est.msrp)}</span>}
                  {(est.low != null || est.high != null) && <span> · used {currency(est.low)}–{currency(est.high)}</span>}
                </p>
              )}
            </div>
            <div>
              <Label>Condition</Label>
              <select value={form.condition} onChange={set('condition')} className={FIELD}>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label>Location</Label>
            <input value={form.location} onChange={set('location')} placeholder="Denver, CO" className={FIELD} />
          </div>

          {form.type !== 'sale' && (
            <div>
              <Label>What would you trade for? (optional)</Label>
              <input value={form.tradeFor} onChange={set('tradeFor')} placeholder="e.g. a gravel bike or a 2-person tent" className={FIELD} />
            </div>
          )}

          <div>
            <Label>Description</Label>
            <textarea value={form.description} onChange={set('description')} rows={5} placeholder="Add photos and hit ✨ auto-fill, or write it yourself…" className={`${FIELD} resize-none`} />
          </div>

          <div>
            <Label>Flaws / repairs needed (optional)</Label>
            <input value={form.repairs} onChange={set('repairs')} placeholder="Be honest — builds trust & avoids returns" className={FIELD} />
          </div>

          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={() => !posting && onClose()} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-full bg-forest-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {posting ? 'Posting…' : 'Post listing'}
          </button>
        </div>
      </form>
    </div>
  )
}

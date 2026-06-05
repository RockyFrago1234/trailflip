import { useEffect, useState } from 'react'
import { Close } from './icons'
import { CONDITIONS } from '../data/listings'
import { currency, dealInfo } from '../utils/format'

const FIELD =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-forest-400 focus:bg-white focus:ring-2 focus:ring-forest-100'

function Label({ children }) {
  return <label className="mb-1 block text-sm font-medium text-slate-700">{children}</label>
}

export default function PostListingModal({ categories, onClose, onSubmit }) {
  const [form, setForm] = useState({
    title: '',
    category: categories[0].id,
    type: 'sale',
    price: '',
    estResale: '',
    condition: 'Good',
    location: '',
    description: '',
    tradeFor: '',
  })

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

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

  const cat = categories.find((c) => c.id === form.category) || categories[0]
  const isTradeOnly = form.type === 'trade'
  const canSubmit = form.title.trim() && (isTradeOnly || form.price)

  // Live flip-potential preview as the seller types.
  const preview = dealInfo({
    price: isTradeOnly ? null : Number(form.price) || null,
    estResale: form.estResale ? Number(form.estResale) : null,
  })

  function submit(e) {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({
      id: 'u-' + Date.now(),
      title: form.title.trim(),
      category: form.category,
      type: form.type,
      price: isTradeOnly ? null : Number(form.price) || null,
      estResale: form.estResale ? Number(form.estResale) : null,
      condition: form.condition,
      location: form.location.trim() || 'Your area',
      description: form.description.trim() || 'No description provided.',
      tradeFor: form.type !== 'sale' ? form.tradeFor.trim() : '',
      emoji: cat.emoji,
      seller: 'You',
      rating: 5.0,
      postedAt: Date.now(),
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        className="animate-pop-in flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Post a listing</h2>
            <p className="text-sm text-slate-500">Saved to this browser so you can demo it anytime.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100"
            aria-label="Close"
          >
            <Close />
          </button>
        </div>

        <div className="grid gap-4 overflow-y-auto px-5 py-5">
          <div>
            <Label>Title</Label>
            <input
              value={form.title}
              onChange={set('title')}
              placeholder="e.g. Trek Marlin 7 mountain bike — size L"
              className={FIELD}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <select value={form.category} onChange={set('category')} className={FIELD}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.label}
                  </option>
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
              <input
                type="number"
                min="0"
                value={form.price}
                onChange={set('price')}
                placeholder={isTradeOnly ? '—' : '700'}
                className={FIELD}
                disabled={isTradeOnly}
              />
            </div>
            <div>
              <Label>Est. resale value ($)</Label>
              <input
                type="number"
                min="0"
                value={form.estResale}
                onChange={set('estResale')}
                placeholder="2600"
                className={FIELD}
              />
            </div>
          </div>

          {preview.tier !== 'none' && (
            <div className="flex items-center justify-between rounded-xl border border-trail-500/30 bg-trail-500/5 px-4 py-2 text-sm">
              <span className="font-semibold text-trail-600">🔥 Flip potential</span>
              <span className="text-slate-700">
                +{currency(preview.profit)} · score {preview.score}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Condition</Label>
              <select value={form.condition} onChange={set('condition')} className={FIELD}>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Location</Label>
              <input
                value={form.location}
                onChange={set('location')}
                placeholder="Denver, CO"
                className={FIELD}
              />
            </div>
          </div>

          {form.type !== 'sale' && (
            <div>
              <Label>What would you trade for? (optional)</Label>
              <input
                value={form.tradeFor}
                onChange={set('tradeFor')}
                placeholder="e.g. a gravel bike or a 2-person tent"
                className={FIELD}
              />
            </div>
          )}

          <div>
            <Label>Description</Label>
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={3}
              placeholder="Condition details, why you're selling, what's included…"
              className={`${FIELD} resize-none`}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-full bg-forest-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Post listing
          </button>
        </div>
      </form>
    </div>
  )
}

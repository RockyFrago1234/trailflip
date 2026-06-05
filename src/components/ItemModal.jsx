import { useEffect, useRef, useState } from 'react'
import { Close } from './icons'
import ImagePlaceholder from './ImagePlaceholder'
import EvaluationReport from './EvaluationReport'
import { getCategory, CONDITIONS } from '../data/listings'
import { currency, itemMath } from '../utils/format'
import {
  STATUS_META,
  updateItem,
  deleteItem,
  uploadListingPhotos,
  baseDraft,
  buildListingText,
} from '../lib/items'
import { fileToResizedDataURL } from '../lib/resizeImage'

const FIELD =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-forest-400 focus:bg-white focus:ring-2 focus:ring-forest-100'
const SOURCES = ['facebook', 'craigslist', 'ebay', 'offerup', 'garage sale', 'other']
const todayStr = () => new Date().toISOString().slice(0, 10)

function Label({ children }) {
  return <label className="mb-1 block text-xs font-medium text-slate-600">{children}</label>
}

function Stat({ label, value, highlight }) {
  return (
    <div className="rounded-xl bg-white p-2 text-center ring-1 ring-slate-100">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-sm font-bold ${highlight ? 'text-forest-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

export default function ItemModal({ item, userId, onClose, onChange, onDelete }) {
  const cat = getCategory(item.category)
  const meta = STATUS_META[item.status] || STATUS_META.prospect
  const math = itemMath(item)
  const gallery = [...item.photos, ...item.officialPhotos]

  const [panel, setPanel] = useState(null) // 'buy' | 'list' | 'sold' | 'photos' | 'evaluation'
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [hero, setHero] = useState(0)

  const [buy, setBuy] = useState({ price: item.askingPrice ?? '', source: 'facebook', date: todayStr() })
  const [draft, setDraft] = useState(() => item.draft || baseDraft(item))
  const [listPrice, setListPrice] = useState(item.listPrice ?? item.draft?.suggested_price_usd ?? baseDraft(item).suggested_price_usd ?? '')
  const [sold, setSold] = useState({ price: item.listPrice ?? '', date: todayStr(), via: '' })
  const [tagInput, setTagInput] = useState('')
  const [officialUrl, setOfficialUrl] = useState(item.evaluation?.manufacturer_url || '')
  const [official, setOfficial] = useState(null) // { images:[{url,dataUrl,source}], note }
  const [picked, setPicked] = useState({})

  const photoInput = useRef(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, busy])

  async function patchItem(label, patch, successNote) {
    setBusy(label)
    setError('')
    try {
      const updated = await updateItem(item.id, patch)
      onChange(updated)
      setPanel(null)
      if (successNote) setNote(successNote)
    } catch (e) {
      setError(e.message || 'Could not save — try again.')
    } finally {
      setBusy('')
    }
  }

  function saveBuy() {
    const price = Number(buy.price) || null
    patchItem(
      'buy',
      {
        status: 'owned',
        buyPrice: price,
        boughtAt: new Date(buy.date).getTime(),
        buySource: buy.source,
        askingPrice: item.askingPrice ?? price,
      },
      'Marked as bought — it’s in your Owned folder. List it whenever you’re ready.',
    )
  }

  function saveList() {
    patchItem(
      'list',
      {
        status: 'listed',
        listedAt: Date.now(),
        listPrice: Number(listPrice) || null,
        title: draft.title?.trim() || item.title,
        description: draft.description?.trim() || item.description,
        condition: draft.condition || item.condition,
        draft,
      },
      'Listed! Copy your listing below and paste it into Facebook / eBay.',
    )
  }

  function saveSold() {
    patchItem(
      'sold',
      {
        status: 'sold',
        soldPrice: Number(sold.price) || null,
        soldAt: new Date(sold.date).getTime(),
        soldVia: sold.via || null,
      },
      'Nice flip! Logged to your books — export anytime from the catalogue.',
    )
  }

  async function addPhotos(files) {
    setBusy('photos')
    setError('')
    try {
      const dataUrls = []
      for (const f of [...files].slice(0, 8)) dataUrls.push(await fileToResizedDataURL(f, 1400, 0.85))
      const stored = await uploadListingPhotos(userId, dataUrls)
      const updated = await updateItem(item.id, { photos: [...item.photos, ...stored] })
      onChange(updated)
    } catch (e) {
      setError(e.message || 'Could not add those photos.')
    } finally {
      setBusy('')
    }
  }

  function removePhoto(url, which) {
    const key = which === 'official' ? 'officialPhotos' : 'photos'
    patchItem('photos', { [key]: item[key].filter((u) => u !== url) })
  }

  async function fetchOfficial() {
    setBusy('official')
    setError('')
    setOfficial(null)
    setPicked({})
    try {
      const resp = await fetch('/api/official-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: officialUrl.trim(), model: [item.brand, item.model].filter(Boolean).join(' ') }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Could not fetch images.')
      setOfficial(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  async function addOfficial() {
    const picks = (official?.images || []).filter((_, i) => picked[i])
    if (!picks.length) return
    setBusy('official-add')
    setError('')
    try {
      const stored = await uploadListingPhotos(userId, picks.map((p) => p.dataUrl))
      const updated = await updateItem(item.id, { officialPhotos: [...item.officialPhotos, ...stored] })
      onChange(updated)
      setOfficial(null)
      setPicked({})
      setNote(`Added ${stored.length} official photo${stored.length > 1 ? 's' : ''}.`)
    } catch (e) {
      setError(e.message || 'Could not add those.')
    } finally {
      setBusy('')
    }
  }

  async function rewriteFromPhotos() {
    if (!item.photos.length) return
    setBusy('draft')
    setError('')
    try {
      const resp = await fetch('/api/draft-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls: item.photos.slice(0, 4) }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Could not write from photos.')
      const d = data.draft
      setDraft((prev) => ({
        ...prev,
        title: d.title || prev.title,
        description: d.description || prev.description,
        key_specs: d.key_specs || prev.key_specs,
        condition: CONDITIONS.includes(d.condition) ? d.condition : prev.condition,
        suggested_price_usd: d.suggested_price_usd ?? prev.suggested_price_usd,
      }))
      if (d.suggested_price_usd != null) setListPrice(String(d.suggested_price_usd))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  function addTag() {
    const t = tagInput.trim().replace(/^#/, '').toLowerCase()
    if (!t || item.tags.includes(t)) return setTagInput('')
    patchItem('tags', { tags: [...item.tags, t] })
    setTagInput('')
  }

  function copy(text, label) {
    navigator.clipboard?.writeText(text)
    setNote(`${label} copied — paste it into your listing.`)
  }

  async function remove() {
    if (!window.confirm('Delete this item from your catalogue? This cannot be undone.')) return
    setBusy('delete')
    try {
      await deleteItem(item.id)
      onDelete(item.id)
    } catch (e) {
      setError(e.message || 'Could not delete.')
      setBusy('')
    }
  }

  const btn = 'rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40'
  const primary = `${btn} bg-forest-600 text-white hover:bg-forest-700`
  const accent = `${btn} bg-trail-500 text-white hover:bg-trail-600`
  const ghost = `${btn} bg-slate-100 text-slate-700 hover:bg-slate-200`

  // Status-specific primary actions.
  const actions = []
  if (item.status === 'wishlist' || item.status === 'prospect') {
    actions.push(<button key="buy" className={primary} onClick={() => setPanel(panel === 'buy' ? null : 'buy')}>✅ I bought it</button>)
    if (item.status === 'prospect')
      actions.push(<button key="wish" className={ghost} onClick={() => patchItem('move', { status: 'wishlist' })} disabled={busy === 'move'}>⭐ Move to wishlist</button>)
    else
      actions.push(<button key="prospect" className={ghost} onClick={() => patchItem('move', { status: 'prospect' })} disabled={busy === 'move'}>🔍 Move to prospects</button>)
  } else if (item.status === 'owned') {
    actions.push(<button key="list" className={primary} onClick={() => setPanel(panel === 'list' ? null : 'list')}>🏷️ List it</button>)
    actions.push(<button key="sold" className={accent} onClick={() => setPanel(panel === 'sold' ? null : 'sold')}>💰 Mark sold</button>)
  } else if (item.status === 'listed') {
    actions.push(<button key="sold" className={primary} onClick={() => setPanel(panel === 'sold' ? null : 'sold')}>💰 Mark sold</button>)
    actions.push(<button key="edit" className={ghost} onClick={() => setPanel(panel === 'list' ? null : 'list')}>✏️ Edit listing</button>)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="animate-pop-in relative flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => !busy && onClose()}
          className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-slate-700 shadow transition hover:bg-white"
          aria-label="Close"
        >
          <Close />
        </button>

        {/* Hero image / gallery */}
        {gallery.length ? (
          <img src={gallery[hero] || gallery[0]} alt={item.title} className="h-56 w-full bg-slate-100 object-contain sm:h-64" />
        ) : (
          <ImagePlaceholder from={cat.from} to={cat.to} emoji={cat.emoji} className="h-48 w-full" emojiClass="text-7xl" />
        )}

        <div className="flex-1 overflow-y-auto">
          {gallery.length > 1 && (
            <div className="flex gap-2 overflow-x-auto px-5 pt-3">
              {gallery.map((u, i) => (
                <button
                  key={u}
                  onClick={() => setHero(i)}
                  className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 ${i === hero ? 'border-forest-500' : 'border-transparent'}`}
                >
                  <img src={u} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <div className="px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${meta.pill}`}>{meta.emoji} {meta.label}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{cat.emoji} {cat.label}</span>
              {item.flipScore != null && (
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">Flip {item.flipScore}</span>
              )}
              {item.evaluation?.confidence && (
                <span className="text-xs text-slate-400">{item.evaluation.confidence} confidence</span>
              )}
            </div>

            <h2 className="mt-3 text-2xl font-extrabold text-slate-900">{item.title}</h2>

            {/* Money snapshot */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="MSRP" value={currency(item.msrp)} />
              <Stat label="Used value" value={item.usedLow != null || item.usedHigh != null ? `${currency(item.usedLow)}–${currency(item.usedHigh)}` : '—'} />
              {item.status === 'sold' ? (
                <Stat label="Realized" value={`${math.realized >= 0 ? '+' : ''}${currency(math.realized)}`} highlight />
              ) : item.status === 'owned' || item.status === 'listed' ? (
                <Stat label="Est. profit" value={`+${currency(math.projected)}`} highlight />
              ) : (
                <Stat label="Potential" value={math.spread > 0 ? `+${currency(math.spread)}` : '—'} highlight />
              )}
            </div>

            {/* The money trail for this item */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              {item.askingPrice != null && <span>Asking <b className="text-slate-900">{currency(item.askingPrice)}</b></span>}
              {item.buyPrice != null && <span>Paid <b className="text-slate-900">{currency(item.buyPrice)}</b>{item.buySource ? ` · ${item.buySource}` : ''}</span>}
              {item.listPrice != null && item.status !== 'sold' && <span>Listed <b className="text-slate-900">{currency(item.listPrice)}</b></span>}
              {item.soldPrice != null && <span>Sold <b className="text-slate-900">{currency(item.soldPrice)}</b></span>}
              {math.holdDays != null && <span>Held <b className="text-slate-900">{math.holdDays}d</b></span>}
            </div>

            {item.sourceUrl && (
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-medium text-forest-700 hover:underline">
                Original listing ↗
              </a>
            )}

            {/* Primary actions */}
            {actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}

            {note && <p className="mt-3 rounded-xl bg-forest-50 px-3 py-2 text-sm font-medium text-forest-800">{note}</p>}
            {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

            {/* ---- Buy panel ---- */}
            {panel === 'buy' && (
              <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-sm font-bold text-slate-900">Log your purchase</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>What you paid ($)</Label>
                    <input type="number" min="0" value={buy.price} onChange={(e) => setBuy({ ...buy, price: e.target.value })} className={FIELD} placeholder="e.g. 700" />
                  </div>
                  <div>
                    <Label>Date</Label>
                    <input type="date" value={buy.date} onChange={(e) => setBuy({ ...buy, date: e.target.value })} className={FIELD} />
                  </div>
                </div>
                <div>
                  <Label>Where from</Label>
                  <select value={buy.source} onChange={(e) => setBuy({ ...buy, source: e.target.value })} className={FIELD}>
                    {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <button className={primary} onClick={saveBuy} disabled={busy === 'buy'}>{busy === 'buy' ? 'Saving…' : 'Confirm — I bought it'}</button>
              </div>
            )}

            {/* ---- List panel ---- */}
            {panel === 'list' && (
              <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-900">Your listing draft</p>
                  {item.photos.length > 0 && (
                    <button onClick={rewriteFromPhotos} disabled={busy === 'draft'} className="rounded-full bg-trail-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-trail-600 disabled:opacity-50">
                      {busy === 'draft' ? 'Writing…' : '✨ Rewrite from my photos'}
                    </button>
                  )}
                </div>
                <div>
                  <Label>Title</Label>
                  <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={FIELD} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Your asking price ($)</Label>
                    <input type="number" min="0" value={listPrice} onChange={(e) => setListPrice(e.target.value)} className={FIELD} />
                  </div>
                  <div>
                    <Label>Condition</Label>
                    <select value={draft.condition} onChange={(e) => setDraft({ ...draft, condition: e.target.value })} className={FIELD}>
                      {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <textarea rows={5} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={`${FIELD} resize-none`} />
                </div>
                <button className={primary} onClick={saveList} disabled={busy === 'list'}>
                  {busy === 'list' ? 'Saving…' : item.status === 'listed' ? 'Save listing' : 'Mark as listed'}
                </button>
              </div>
            )}

            {/* ---- Sold panel ---- */}
            {panel === 'sold' && (
              <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-sm font-bold text-slate-900">Log the sale</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Sold for ($)</Label>
                    <input type="number" min="0" value={sold.price} onChange={(e) => setSold({ ...sold, price: e.target.value })} className={FIELD} placeholder="e.g. 2600" />
                  </div>
                  <div>
                    <Label>Date</Label>
                    <input type="date" value={sold.date} onChange={(e) => setSold({ ...sold, date: e.target.value })} className={FIELD} />
                  </div>
                </div>
                {Number(sold.price) > 0 && item.buyPrice != null && (
                  <p className="text-sm text-slate-600">Profit on this flip: <b className="text-forest-700">+{currency(Number(sold.price) - item.buyPrice)}</b></p>
                )}
                <button className={primary} onClick={saveSold} disabled={busy === 'sold'}>{busy === 'sold' ? 'Saving…' : 'Confirm sale'}</button>
              </div>
            )}

            {/* ---- Copy / share (for listed items) ---- */}
            {item.status === 'listed' && (
              <div className="mt-4 rounded-2xl border border-forest-200 bg-forest-50/60 p-4">
                <p className="text-sm font-bold text-slate-900">📤 Post it everywhere</p>
                <p className="mt-1 text-xs text-slate-500">We copy your listing — paste it into the marketplace’s form. Your photos are saved here to upload.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className={ghost} onClick={() => copy(buildListingText(item), 'Full listing')}>Copy listing</button>
                  <button className={ghost} onClick={() => copy(draft.title || item.title, 'Title')}>Copy title</button>
                  <button className={ghost} onClick={() => copy(item.description, 'Description')}>Copy description</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className={accent} onClick={() => { copy(buildListingText(item), 'Listing'); window.open('https://www.facebook.com/marketplace/create/item', '_blank') }}>Facebook ↗</button>
                  <button className={accent} onClick={() => { copy(buildListingText(item), 'Listing'); window.open('https://www.ebay.com/sl/sell', '_blank') }}>eBay ↗</button>
                  {typeof navigator !== 'undefined' && navigator.share && (
                    <button className={ghost} onClick={() => navigator.share({ title: item.title, text: buildListingText(item) }).catch(() => {})}>Share…</button>
                  )}
                </div>
              </div>
            )}

            {/* ---- Photos manager ---- */}
            <div className="mt-5 rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900">📷 Photos</p>
                <button onClick={() => photoInput.current?.click()} disabled={busy === 'photos'} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50">
                  {busy === 'photos' ? 'Adding…' : '+ Add your photos'}
                </button>
                <input ref={photoInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files?.length && addPhotos(e.target.files)} />
              </div>

              {gallery.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.photos.map((u) => (
                    <Thumb key={u} url={u} onRemove={() => removePhoto(u, 'mine')} />
                  ))}
                  {item.officialPhotos.map((u) => (
                    <Thumb key={u} url={u} badge="official" onRemove={() => removePhoto(u, 'official')} />
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">No photos yet. Snap your own (best for trust), or pull official ones below.</p>
              )}

              {/* Official photos */}
              {(item.brand || item.model) && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <Label>Pull official photos for an exact model (you approve each)</Label>
                  <div className="flex gap-2">
                    <input value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} placeholder="Manufacturer / product-page URL" className={FIELD} />
                    <button onClick={fetchOfficial} disabled={busy === 'official' || !/^https?:\/\//i.test(officialUrl.trim())} className={`${ghost} shrink-0`}>
                      {busy === 'official' ? '…' : 'Fetch'}
                    </button>
                  </div>
                  {official && official.note && <p className="mt-2 text-xs text-slate-500">{official.note}</p>}
                  {official && official.images?.length > 0 && (
                    <>
                      <p className="mt-3 text-xs text-slate-500">From <b>{official.source}</b> — tap the exact-match photos, then add.</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {official.images.map((img, i) => (
                          <button
                            key={i}
                            onClick={() => setPicked((p) => ({ ...p, [i]: !p[i] }))}
                            className={`relative h-20 w-20 overflow-hidden rounded-xl border-2 ${picked[i] ? 'border-forest-500 ring-2 ring-forest-200' : 'border-slate-200'}`}
                          >
                            <img src={img.dataUrl} alt="" className="h-full w-full object-cover" />
                            {picked[i] && <span className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-forest-600 text-xs text-white">✓</span>}
                          </button>
                        ))}
                      </div>
                      <button onClick={addOfficial} disabled={busy === 'official-add' || !Object.values(picked).some(Boolean)} className={`${primary} mt-3`}>
                        {busy === 'official-add' ? 'Adding…' : 'Add selected photos'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ---- Tags / folders ---- */}
            <div className="mt-4 rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-bold text-slate-900">🗂️ Folders / tags</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {item.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    #{t}
                    <button onClick={() => patchItem('tags', { tags: item.tags.filter((x) => x !== t) })} className="text-slate-400 hover:text-rose-500" aria-label={`Remove ${t}`}>×</button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  placeholder="+ add folder"
                  className="w-28 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs outline-none focus:border-forest-400 focus:bg-white"
                />
              </div>
            </div>

            {/* ---- Saved evaluation ---- */}
            {item.evaluation && (
              <div className="mt-4">
                <button onClick={() => setPanel(panel === 'evaluation' ? null : 'evaluation')} className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-50">
                  <span>✨ Saved AI evaluation</span>
                  <span className="text-slate-400">{panel === 'evaluation' ? '−' : '+'}</span>
                </button>
                {panel === 'evaluation' && (
                  <div className="mt-3">
                    <EvaluationReport result={item.evaluation} showHeader={false} />
                  </div>
                )}
              </div>
            )}

            <button onClick={remove} disabled={busy === 'delete'} className="mt-5 w-full rounded-full border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50">
              {busy === 'delete' ? 'Deleting…' : 'Delete from catalogue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Thumb({ url, badge, onRemove }) {
  return (
    <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200">
      <img src={url} alt="" className="h-full w-full object-cover" />
      {badge && <span className="absolute bottom-0 left-0 right-0 bg-black/55 py-0.5 text-center text-[9px] font-semibold uppercase text-white">{badge}</span>}
      <button onClick={onRemove} className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-xs text-slate-700 shadow" aria-label="Remove photo">×</button>
    </div>
  )
}

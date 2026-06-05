import { useEffect, useRef, useState } from 'react'
import { Close } from './icons'
import ImagePlaceholder from './ImagePlaceholder'
import EvaluationReport from './EvaluationReport'
import { getCategory, CONDITIONS } from '../data/listings'
import { currency, itemMath, effectiveScore, MILEAGE_RATE } from '../utils/format'
import {
  STATUS_META,
  updateItem,
  deleteItem,
  uploadListingPhotos,
  baseDraft,
  buildListingText,
  suggestedFee,
} from '../lib/items'
import { fileToResizedDataURL } from '../lib/resizeImage'
import { cleanWhiteBg } from '../lib/cleanupPhoto'
import { supabase } from '../lib/supabase'
import { loadItemExpenses, createExpense, deleteExpense, EXPENSE_CATEGORIES, expenseLabel } from '../lib/expenses'

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

export default function ItemModal({ item, userId, onClose, onChange, onDelete, onWatch, onExpenseChanged }) {
  const cat = getCategory(item.category)
  const meta = STATUS_META[item.status] || STATUS_META.prospect
  const math = itemMath(item)
  const score = effectiveScore(item)
  const boosted = score != null && item.flipScore != null && score > item.flipScore
  const gallery = [...item.photos, ...item.officialPhotos, ...item.representativePhotos]

  const [panel, setPanel] = useState(null) // 'buy' | 'list' | 'sold' | 'photos' | 'evaluation'
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [hero, setHero] = useState(0)

  const [buy, setBuy] = useState({ price: item.askingPrice ?? '', source: 'facebook', date: todayStr() })
  const [draft, setDraft] = useState(() => item.draft || baseDraft(item))
  const [listPrice, setListPrice] = useState(item.listPrice ?? item.draft?.suggested_price_usd ?? baseDraft(item).suggested_price_usd ?? '')
  const [sold, setSold] = useState({
    price: item.soldPrice ?? item.listPrice ?? '',
    date: item.soldAt ? new Date(item.soldAt).toISOString().slice(0, 10) : todayStr(),
    via: item.soldVia || item.buySource || '',
    fees: item.fees ?? '',
    shipping: item.shippingCost ?? '',
    supplies: item.suppliesCost ?? '',
    miles: item.miles ?? '',
  })
  const [tagInput, setTagInput] = useState('')
  const [officialUrl, setOfficialUrl] = useState(item.evaluation?.manufacturer_url || '')
  const [official, setOfficial] = useState(null) // { images:[{url,dataUrl,source}], note }
  const [picked, setPicked] = useState({})
  const [genBusy, setGenBusy] = useState('') // '' | 'studio' | 'representative'
  const [genImage, setGenImage] = useState(null) // { image, mode }
  const [genNeedsKey, setGenNeedsKey] = useState(false)
  const [payBusy, setPayBusy] = useState(false)
  const [payLink, setPayLink] = useState('')
  const [ebayUrl, setEbayUrl] = useState('')
  const [itemExpenses, setItemExpenses] = useState([])
  const [expForm, setExpForm] = useState({ category: 'repair', amount: '', note: '' })
  const [expBusy, setExpBusy] = useState(false)

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

  useEffect(() => {
    if (!userId) return
    let active = true
    loadItemExpenses(userId, item.id).then((rows) => active && setItemExpenses(rows))
    return () => {
      active = false
    }
  }, [userId, item.id])

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
    const patch = {
      status: 'sold',
      soldPrice: Number(sold.price) || null,
      soldAt: new Date(sold.date).getTime(),
      soldVia: sold.via || null,
    }
    // Cost fields are optional (and behind a migration) — only send when entered,
    // so the basic sold flow works even before the migration is applied.
    if (sold.fees !== '') patch.fees = Number(sold.fees)
    if (sold.shipping !== '') patch.shippingCost = Number(sold.shipping)
    if (sold.supplies !== '') patch.suppliesCost = Number(sold.supplies)
    if (sold.miles !== '') patch.miles = Number(sold.miles)
    patchItem('sold', patch, 'Nice flip! Net profit logged to your books — export anytime from the catalogue.')
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

  async function cleanPhoto(url) {
    setBusy('clean')
    setError('')
    try {
      const dataUrl = await cleanWhiteBg(url)
      const stored = await uploadListingPhotos(userId, [dataUrl])
      const updated = await updateItem(item.id, { photos: [...stored, ...item.photos] })
      onChange(updated)
      setNote('Clean white-background version added as your cover photo.')
    } catch (e) {
      setError(e.message || 'Background cleanup failed — try a clearer, well-lit photo.')
    } finally {
      setBusy('')
    }
  }

  function removePhoto(url, which) {
    const key = which === 'official' ? 'officialPhotos' : which === 'representative' ? 'representativePhotos' : 'photos'
    patchItem('photos', { [key]: item[key].filter((u) => u !== url) })
  }

  async function fetchOfficial(useSearch) {
    setBusy(useSearch ? 'official-search' : 'official')
    setError('')
    setOfficial(null)
    setPicked({})
    try {
      const payload = useSearch
        ? { brand: item.brand, model: item.model, year: item.year }
        : { url: officialUrl.trim(), model: [item.brand, item.model].filter(Boolean).join(' ') }
      const resp = await fetch('/api/official-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      const exact = picks.filter((p) => p.exact !== false)
      const rep = picks.filter((p) => p.exact === false)
      const patch = {}
      if (exact.length) patch.officialPhotos = [...item.officialPhotos, ...(await uploadListingPhotos(userId, exact.map((p) => p.dataUrl)))]
      if (rep.length) patch.representativePhotos = [...item.representativePhotos, ...(await uploadListingPhotos(userId, rep.map((p) => p.dataUrl)))]
      const updated = await updateItem(item.id, patch)
      onChange(updated)
      setOfficial(null)
      setPicked({})
      const n = exact.length + rep.length
      setNote(`Added ${n} photo${n > 1 ? 's' : ''}${rep.length ? ` (${rep.length} similar-model — disclosed in the listing)` : ''}.`)
    } catch (e) {
      setError(e.message || 'Could not add those.')
    } finally {
      setBusy('')
    }
  }

  async function generateImage(mode) {
    setGenBusy(mode)
    setError('')
    setGenImage(null)
    try {
      const payload = { mode, brand: item.brand, model: item.model, year: item.year, category: cat.label, title: item.title }
      if (mode === 'studio') payload.imageUrl = item.photos[0]
      const resp = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Image generation failed.')
      if (data.needsKey) {
        setGenNeedsKey(true)
        return
      }
      setGenImage({ image: data.image, mode: data.mode })
    } catch (e) {
      setError(e.message)
    } finally {
      setGenBusy('')
    }
  }

  async function addGenerated() {
    if (!genImage) return
    setBusy('gen-add')
    setError('')
    try {
      const [stored] = await uploadListingPhotos(userId, [genImage.image])
      const key = genImage.mode === 'studio' ? 'photos' : 'representativePhotos'
      const updated = await updateItem(item.id, { [key]: [...item[key], stored] })
      onChange(updated)
      setGenImage(null)
      setNote(genImage.mode === 'studio'
        ? 'AI studio photo added to your photos.'
        : 'AI representative image added — it’s auto-disclosed as representative in your listing text.')
    } catch (e) {
      setError(e.message || 'Could not save the image.')
    } finally {
      setBusy('')
    }
  }

  async function listOnEbay() {
    setBusy('ebay')
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Please sign in again.')
        return
      }
      const imageUrls = [...item.photos, ...item.officialPhotos, ...item.representativePhotos]
      const resp = await fetch('/api/ebay-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          title: draft.title || item.title,
          description: draft.description || item.description,
          price: item.listPrice ?? (Number(listPrice) || null),
          condition: draft.condition || item.condition,
          imageUrls,
        }),
      })
      const data = await resp.json()
      if (data.configured === false) {
        setError('eBay one-click listing needs the eBay API keys + EBAY_REDIRECT_URI set on the server.')
        return
      }
      if (data.connected === false) {
        setError('Connect your eBay account first (top-right menu → Connect eBay).')
        return
      }
      if (data.needsSetup) {
        setError(data.error)
        return
      }
      if (!resp.ok || data.error) throw new Error(data.error || 'eBay listing failed.')
      setEbayUrl(data.url || '')
      setNote('Listed on eBay! 🎉')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  function sendToExtension() {
    const payload = {
      title: draft.title || item.title,
      price: item.listPrice ?? (Number(listPrice) || null),
      description: draft.description || item.description || '',
      condition: draft.condition || item.condition || '',
    }
    window.postMessage({ source: 'trailflip-lister', listing: payload }, '*')
    copy(draft.title || item.title, 'Title')
    window.open('https://www.facebook.com/marketplace/create/item', '_blank')
    setNote('Sent to the TrailFlip extension — Facebook auto-fills if the extension is installed (chrome://extensions → Load unpacked → extension/).')
  }

  async function createPaymentLink() {
    setPayBusy(true)
    setError('')
    try {
      const amount = Number(item.listPrice ?? listPrice ?? 0)
      const resp = await fetch('/api/payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: draft.title || item.title, amount }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Could not create a payment link.')
      if (data.configured === false) {
        setError('Payments need a Stripe key (set STRIPE_SECRET_KEY on the server).')
        return
      }
      setPayLink(data.url)
      navigator.clipboard?.writeText(data.url)
      setNote('Payment link created & copied — send it to your buyer.')
    } catch (e) {
      setError(e.message)
    } finally {
      setPayBusy(false)
    }
  }

  async function addItemExpense() {
    const amount = Number(expForm.amount)
    if (!amount || amount <= 0) return
    setExpBusy(true)
    setError('')
    try {
      const e = await createExpense(userId, { date: todayStr(), category: expForm.category, amount, note: expForm.note, itemId: item.id })
      setItemExpenses((prev) => [e, ...prev])
      setExpForm({ category: expForm.category, amount: '', note: '' })
      onExpenseChanged?.()
    } catch (err) {
      setError(err.message || 'Could not add expense.')
    } finally {
      setExpBusy(false)
    }
  }

  async function removeItemExpense(id) {
    setItemExpenses((prev) => prev.filter((e) => e.id !== id))
    try {
      await deleteExpense(id)
      onExpenseChanged?.()
    } catch {
      /* ignore */
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
        body: JSON.stringify({
          imageUrls: item.photos.slice(0, 8),
          brand: item.brand,
          model: item.model,
          year: item.year,
        }),
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
        stock_status: d.stock_status || prev.stock_status,
        modifications: Array.isArray(d.modifications) ? d.modifications : prev.modifications,
        keywords: Array.isArray(d.keywords) ? d.keywords : prev.keywords,
        best_platform: d.best_platform ?? prev.best_platform,
        best_time: d.best_time ?? prev.best_time,
        spec_source: d.spec_source ?? prev.spec_source,
      }))
      if (d.suggested_price_usd != null) setListPrice(String(d.suggested_price_usd))
      setNote(data.researched ? 'Rewrote from your photos + web research on the model.' : 'Rewrote from your photos.')
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

  const itemExpenseTotal = itemExpenses.reduce((s, e) => s + (e.amount || 0), 0)

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
    if (onWatch)
      actions.push(
        <button
          key="watch"
          className={ghost}
          onClick={() => {
            onWatch({ query: [item.brand, item.model, item.year].filter(Boolean).join(' ') || item.title, maxPrice: item.askingPrice ?? item.usedLow ?? null })
            setNote('Added to your Deal hunts 🔭 — search it across marketplaces from the catalogue.')
          }}
        >
          🔭 Watch for deals
        </button>,
      )
  } else if (item.status === 'owned') {
    actions.push(<button key="list" className={primary} onClick={() => setPanel(panel === 'list' ? null : 'list')}>🏷️ List it</button>)
    actions.push(<button key="sold" className={accent} onClick={() => setPanel(panel === 'sold' ? null : 'sold')}>💰 Mark sold</button>)
  } else if (item.status === 'listed') {
    actions.push(<button key="sold" className={primary} onClick={() => setPanel(panel === 'sold' ? null : 'sold')}>💰 Mark sold</button>)
    actions.push(<button key="edit" className={ghost} onClick={() => setPanel(panel === 'list' ? null : 'list')}>✏️ Edit listing</button>)
  } else if (item.status === 'sold') {
    actions.push(<button key="editsale" className={ghost} onClick={() => setPanel(panel === 'sold' ? null : 'sold')}>✏️ Edit sale</button>)
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
              {score != null && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${boosted ? 'bg-forest-600' : 'bg-slate-900'}`}
                  title={boosted ? `Rose from ${item.flipScore} after buying below asking` : 'Flip score'}
                >
                  Flip {score}{boosted ? ` ↑ (was ${item.flipScore})` : ''}
                </span>
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
                <Stat label="Net profit" value={`${math.realized - itemExpenseTotal >= 0 ? '+' : ''}${currency(math.realized - itemExpenseTotal)}`} highlight />
              ) : item.status === 'owned' || item.status === 'listed' ? (
                <Stat label="Est. profit" value={`+${currency(math.projected - itemExpenseTotal)}`} highlight />
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
              {item.status === 'sold' && math.costs > 0 && <span>Costs <b className="text-slate-900">{currency(math.costs)}</b></span>}
              {item.status === 'sold' && math.mileageDeduction > 0 && <span>Mileage ded. <b className="text-slate-900">{currency(math.mileageDeduction)}</b></span>}
              {itemExpenseTotal > 0 && <span>Item expenses <b className="text-slate-900">{currency(itemExpenseTotal)}</b></span>}
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
                    <button onClick={rewriteFromPhotos} disabled={busy === 'draft'} className="rounded-full bg-trail-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-trail-600 disabled:opacity-50" title="Identifies the model, looks up the owner's manual for real specs, and writes the listing">
                      {busy === 'draft' ? 'Researching…' : '✨ Research & rewrite'}
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

                {((draft.stock_status && draft.stock_status !== 'unknown') || (draft.modifications || []).length || (draft.keywords || []).length || draft.best_platform || draft.spec_source) ? (
                  <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                    {draft.stock_status === 'modified' || (draft.modifications || []).length ? (
                      <p>🔧 <b className="text-slate-900">Modified:</b> {(draft.modifications || []).join(', ') || 'yes'}</p>
                    ) : draft.stock_status === 'stock' ? (
                      <p>✅ <b className="text-slate-900">Stock</b> — no modifications detected</p>
                    ) : null}
                    {draft.spec_source && <p>📖 Specs from {draft.spec_source}</p>}
                    {draft.best_platform && <p>📈 <b className="text-slate-900">Best sold on:</b> {draft.best_platform}{draft.best_time ? ` · ${draft.best_time}` : ''}</p>}
                    {(draft.keywords || []).length > 0 && (
                      <p className="break-words">🔑 {draft.keywords.slice(0, 12).map((k) => `#${String(k).replace(/^#/, '').replace(/\s+/g, '')}`).join(' ')}</p>
                    )}
                    <p className="text-slate-400">All of this is included when you copy the listing below.</p>
                  </div>
                ) : null}

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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Sold via</Label>
                    <select
                      value={sold.via}
                      onChange={(e) => {
                        const via = e.target.value
                        const suggest = suggestedFee(Number(sold.price) || 0, via)
                        setSold((s) => ({ ...s, via, fees: s.fees === '' && suggest ? String(suggest) : s.fees }))
                      }}
                      className={FIELD}
                    >
                      <option value="">—</option>
                      {SOURCES.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Marketplace fees ($)</Label>
                    <input type="number" min="0" value={sold.fees} onChange={(e) => setSold({ ...sold, fees: e.target.value })} className={FIELD} placeholder="auto by platform" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Shipping ($)</Label>
                    <input type="number" min="0" value={sold.shipping} onChange={(e) => setSold({ ...sold, shipping: e.target.value })} className={FIELD} placeholder="0" />
                  </div>
                  <div>
                    <Label>Supplies ($)</Label>
                    <input type="number" min="0" value={sold.supplies} onChange={(e) => setSold({ ...sold, supplies: e.target.value })} className={FIELD} placeholder="0" />
                  </div>
                  <div>
                    <Label>Miles (round-trip)</Label>
                    <input type="number" min="0" value={sold.miles} onChange={(e) => setSold({ ...sold, miles: e.target.value })} className={FIELD} placeholder="0" />
                  </div>
                </div>
                {Number(sold.price) > 0 && item.buyPrice != null && (() => {
                  const sp = Number(sold.price) || 0
                  const net = sp - item.buyPrice - (Number(sold.fees) || 0) - (Number(sold.shipping) || 0) - (Number(sold.supplies) || 0)
                  const md = (Number(sold.miles) || 0) * MILEAGE_RATE
                  return (
                    <div className="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Net profit (after costs)</span>
                        <b className={net >= 0 ? 'text-forest-700' : 'text-rose-600'}>{net >= 0 ? '+' : ''}{currency(net)}</b>
                      </div>
                      {md > 0 && (
                        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                          <span>+ mileage tax deduction ({sold.miles} mi)</span>
                          <span>{currency(md)}</span>
                        </div>
                      )}
                    </div>
                  )
                })()}
                <button className={primary} onClick={saveSold} disabled={busy === 'sold'}>{busy === 'sold' ? 'Saving…' : item.status === 'sold' ? 'Save sale' : 'Confirm sale'}</button>
              </div>
            )}

            {/* ---- Copy / share (for listed items) ---- */}
            {item.status === 'listed' && (
              <div className="mt-4 rounded-2xl border border-forest-200 bg-forest-50/60 p-4">
                <p className="text-sm font-bold text-slate-900">📤 Post it everywhere</p>
                <p className="mt-1 text-xs text-slate-500">
                  Marketplaces block other sites from auto-filling their forms, so TrailFlip copies each field for you — open the site and paste (Ctrl/⌘+V) into each box. Tap a field to copy it:
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className={ghost} onClick={() => copy(draft.title || item.title, 'Title')}>📋 Title</button>
                  {item.listPrice != null && <button className={ghost} onClick={() => copy(String(Math.round(item.listPrice)), 'Price')}>📋 Price</button>}
                  <button className={ghost} onClick={() => copy(draft.description || item.description, 'Description')}>📋 Description</button>
                  <button className={ghost} onClick={() => copy(buildListingText(item), 'Full listing')}>📋 Everything</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className={accent} onClick={() => { copy(draft.title || item.title, 'Title'); window.open('https://www.facebook.com/marketplace/create/item', '_blank') }}>Facebook ↗</button>
                  <button className={ghost} onClick={sendToExtension} title="Auto-fills the Facebook form if the TrailFlip browser extension is installed">📨 Auto-fill FB</button>
                  <button className={accent} onClick={() => { copy(draft.title || item.title, 'Title'); window.open('https://www.ebay.com/sl/sell', '_blank') }}>eBay ↗</button>
                  {typeof navigator !== 'undefined' && navigator.share && (
                    <button className={ghost} onClick={() => navigator.share({ title: item.title, text: buildListingText(item) }).catch(() => {})}>Share…</button>
                  )}
                </div>
                <div className="mt-2">
                  <button className={primary} onClick={listOnEbay} disabled={busy === 'ebay'}>{busy === 'ebay' ? 'Listing on eBay…' : '🟢 List on eBay — one click'}</button>
                  {ebayUrl && <a href={ebayUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs font-semibold text-forest-700 hover:underline">View live listing ↗</a>}
                </div>
                <p className="mt-2 text-[11px] text-slate-400">Facebook/eBay buttons copy your title first — paste it, then tap the next field above. <b>List on eBay</b> posts directly via the eBay API (connect eBay in the top-right menu; needs your eBay business policies set up).</p>

                <div className="mt-3 border-t border-forest-200/60 pt-3">
                  <button className={ghost} onClick={createPaymentLink} disabled={payBusy}>{payBusy ? 'Creating…' : '💳 Create Stripe payment link'}</button>
                  {payLink && (
                    <a href={payLink} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all text-xs font-semibold text-forest-700 hover:underline">{payLink} ↗</a>
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
                    <Thumb key={u} url={u} onRemove={() => removePhoto(u, 'mine')} onClean={() => cleanPhoto(u)} cleaning={busy === 'clean'} />
                  ))}
                  {item.officialPhotos.map((u) => (
                    <Thumb key={u} url={u} badge="official" onRemove={() => removePhoto(u, 'official')} />
                  ))}
                  {item.representativePhotos.map((u) => (
                    <Thumb key={u} url={u} badge="similar" onRemove={() => removePhoto(u, 'representative')} />
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">No photos yet. Snap your own (best for trust), or pull official ones below.</p>
              )}

              {/* Official photos — search the web or paste a URL; you approve each */}
              {(item.brand || item.model) && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <Label>Add official product photos (you approve each)</Label>
                  <button
                    onClick={() => fetchOfficial(true)}
                    disabled={!!busy}
                    className="rounded-full bg-trail-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-trail-600 disabled:opacity-50"
                  >
                    {busy === 'official-search' ? 'Searching the web…' : '🔎 Search the web for this model'}
                  </button>
                  <div className="mt-2 flex gap-2">
                    <input value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} placeholder="…or paste a product-page URL" className={FIELD} />
                    <button onClick={() => fetchOfficial(false)} disabled={busy === 'official' || !/^https?:\/\//i.test(officialUrl.trim())} className={`${ghost} shrink-0`}>
                      {busy === 'official' ? '…' : 'Fetch'}
                    </button>
                  </div>
                  {official && official.note && <p className="mt-2 text-xs text-slate-500">{official.note}</p>}
                  {official && official.images?.length > 0 && (
                    <>
                      <p className="mt-3 text-xs text-slate-500">Tap the photos that match your item, then add. <b>Similar-model</b> shots are labeled and auto-disclosed in the listing.</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {official.images.map((img, i) => (
                          <button
                            key={i}
                            onClick={() => setPicked((p) => ({ ...p, [i]: !p[i] }))}
                            className={`relative h-20 w-20 overflow-hidden rounded-xl border-2 ${picked[i] ? 'border-forest-500 ring-2 ring-forest-200' : 'border-slate-200'}`}
                          >
                            <img src={img.dataUrl} alt="" className="h-full w-full object-cover" />
                            {picked[i] && <span className="absolute right-0.5 top-0.5 z-10 grid h-5 w-5 place-items-center rounded-full bg-forest-600 text-xs text-white">✓</span>}
                            <span className={`absolute bottom-0 left-0 right-0 truncate px-1 py-0.5 text-center text-[8px] font-semibold uppercase text-white ${img.exact === false ? 'bg-amber-600/90' : 'bg-black/60'}`}>
                              {img.exact === false ? 'similar' : img.source || 'official'}
                            </span>
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

              {/* AI-generated product photos */}
              <div className="mt-4 border-t border-slate-100 pt-3">
                <Label>AI product photos</Label>
                <div className="flex flex-wrap gap-2">
                  {item.photos.length > 0 && (
                    <button onClick={() => generateImage('studio')} disabled={!!genBusy || !!busy} className="rounded-full bg-trail-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-trail-600 disabled:opacity-50">
                      {genBusy === 'studio' ? 'Generating…' : '✨ Studio version of my photo'}
                    </button>
                  )}
                  {(item.brand || item.model) && (
                    <button onClick={() => generateImage('representative')} disabled={!!genBusy || !!busy} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50">
                      {genBusy === 'representative' ? 'Generating…' : '🎨 Generate representative image'}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Representative generates a <b>free</b> catalog image of the model (auto-disclosed in your listing). Studio re-lights your own photo into a clean shot (needs an OpenAI key).</p>
                {genNeedsKey && (
                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="font-semibold">Studio mode needs an OpenAI key</p>
                    <p className="mt-1">Set <span className="font-mono">OPENAI_API_KEY</span> in Vercel → Settings → Environment Variables (platform.openai.com → API keys, then verify your org), and redeploy. Or just use <b>Representative</b> — it’s free.</p>
                  </div>
                )}
                {genImage && (
                  <div className="mt-3 flex items-center gap-3">
                    <img src={genImage.image} alt="AI generated" className="h-28 w-28 rounded-xl object-cover ring-1 ring-slate-200" />
                    <div className="flex flex-col gap-2">
                      <button onClick={addGenerated} disabled={busy === 'gen-add'} className={primary}>{busy === 'gen-add' ? 'Saving…' : 'Add this photo'}</button>
                      <button onClick={() => setGenImage(null)} className={ghost}>Discard</button>
                    </div>
                  </div>
                )}
              </div>
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

            {/* ---- Item expenses (travel / repair / taxes tied to this product) ---- */}
            <div className="mt-4 rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900">🧾 Item expenses</p>
                {itemExpenseTotal > 0 && <span className="text-sm font-bold text-slate-900">{currency(itemExpenseTotal)}</span>}
              </div>
              <p className="mt-1 text-xs text-slate-500">Costs tied to this product — travel to grab it, repairs/parts, taxes. They lower this item’s net and show up in your Books.</p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <select value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value })} className={`${FIELD} max-w-[10rem]`}>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <input type="number" min="0" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} placeholder="$" className={`${FIELD} w-24`} />
                <input value={expForm.note} onChange={(e) => setExpForm({ ...expForm, note: e.target.value })} placeholder="note (optional)" className={`${FIELD} min-w-[8rem] flex-1`} />
                <button onClick={addItemExpense} disabled={expBusy || !Number(expForm.amount)} className={ghost}>{expBusy ? 'Adding…' : 'Add'}</button>
              </div>
              {itemExpenses.length > 0 && (
                <div className="mt-3 divide-y divide-slate-50">
                  {itemExpenses.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 py-1.5 text-sm">
                      <span className="w-20 shrink-0 text-xs text-slate-400">{e.date}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{expenseLabel(e.category)}</span>
                      <span className="truncate text-slate-600">{e.note}</span>
                      <span className="ml-auto font-semibold tabular-nums text-slate-900">{currency(e.amount)}</span>
                      <button onClick={() => removeItemExpense(e.id)} className="rounded-full px-1.5 text-slate-400 transition hover:text-rose-500" aria-label="Delete">×</button>
                    </div>
                  ))}
                </div>
              )}
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

function Thumb({ url, badge, onRemove, onClean, cleaning }) {
  return (
    <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200">
      <img src={url} alt="" className="h-full w-full object-cover" />
      {badge && <span className="absolute bottom-0 left-0 right-0 bg-black/55 py-0.5 text-center text-[9px] font-semibold uppercase text-white">{badge}</span>}
      <button onClick={onRemove} className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-xs text-slate-700 shadow" aria-label="Remove photo">×</button>
      {onClean && (
        <button
          onClick={onClean}
          disabled={cleaning}
          className="absolute bottom-0.5 left-0.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 shadow transition hover:bg-white disabled:opacity-60"
          title="Remove the background → clean white-bg cover photo"
        >
          {cleaning ? '…' : '✨ BG'}
        </button>
      )}
    </div>
  )
}

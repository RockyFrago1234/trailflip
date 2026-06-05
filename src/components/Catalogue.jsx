import { useEffect, useMemo, useState } from 'react'
import ItemCard from './ItemCard'
import ItemModal from './ItemModal'
import DealScanner from './DealScanner'
import { STATUS_META } from '../lib/items'
import { loadSearches, createSearch, deleteSearch, marketplaceLinks } from '../lib/searches'
import { loadBoards, addToBoard, candidateFromItem } from '../lib/compare'
import { currency, portfolio, toCSV, effectiveScore } from '../utils/format'

const FOLDERS = [
  { id: 'all', label: 'All', emoji: '🧰', test: () => true },
  { id: 'wishlist', label: 'Wishlist', emoji: STATUS_META.wishlist.emoji, test: (i) => i.status === 'wishlist' },
  { id: 'prospect', label: 'Prospects', emoji: STATUS_META.prospect.emoji, test: (i) => i.status === 'prospect' },
  { id: 'owned', label: 'Owned', emoji: STATUS_META.owned.emoji, test: (i) => i.status === 'owned' },
  { id: 'listed', label: 'Listed', emoji: STATUS_META.listed.emoji, test: (i) => i.status === 'listed' },
  { id: 'sold', label: 'Sold', emoji: STATUS_META.sold.emoji, test: (i) => i.status === 'sold' },
  { id: 'scans', label: 'All Scans', emoji: '🗂️', test: (i) => !!i.evaluation },
]

// Flip-score bands: 0–10, 10–20, … 90–100 (top band includes 100).
const SCORE_BANDS = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  label: `${i * 10}–${i * 10 + 10}`,
  test: (s) => s != null && s >= i * 10 && (i === 9 ? s <= 100 : s < i * 10 + 10),
}))

const todayStr = () => new Date().toISOString().slice(0, 10)

function PnL({ items }) {
  const p = portfolio(items)
  const cells = [
    { label: 'Tied up', value: currency(p.tiedUp) },
    { label: 'Net profit', value: `${p.realized >= 0 ? '+' : ''}${currency(p.realized)}`, good: true },
    { label: 'Projected', value: `+${currency(p.projected)}` },
    { label: 'Mileage ded.', value: currency(p.mileageDeduction) },
    { label: 'Flips closed', value: String(p.soldCount) },
    { label: 'Avg hold', value: p.avgHold != null ? `${p.avgHold}d` : '—' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {cells.map((c) => (
        <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">{c.label}</p>
          <p className={`text-lg font-extrabold ${c.good ? 'text-forest-700' : 'text-slate-900'}`}>{c.value}</p>
        </div>
      ))}
    </div>
  )
}

export default function Catalogue({ items, userId, onItemChange, onItemDelete, onItemAdd, onScan, onEvaluateUrl, onOpenCompare }) {
  const [folder, setFolder] = useState('all')
  const [tag, setTag] = useState(null)
  const [scoreBand, setScoreBand] = useState(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [scanHunt, setScanHunt] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [targetBoard, setTargetBoard] = useState('')

  // Saved "deal hunts"
  const [searches, setSearches] = useState([])
  const [hunt, setHunt] = useState({ query: '', maxPrice: '' })
  const [addingHunt, setAddingHunt] = useState(false)

  useEffect(() => {
    if (!userId) return
    let active = true
    loadSearches(userId)
      .then((s) => {
        if (active) setSearches(s)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [userId])

  async function addHunt(fields) {
    const q = (fields?.query ?? hunt.query).trim()
    if (!q) return
    const maxPrice = fields?.maxPrice ?? (hunt.maxPrice === '' ? null : Number(hunt.maxPrice))
    try {
      const s = await createSearch(userId, { query: q, maxPrice })
      setSearches((prev) => [s, ...prev.filter((x) => x.id !== s.id)])
      setHunt({ query: '', maxPrice: '' })
      setAddingHunt(false)
    } catch {
      /* ignore */
    }
  }

  async function removeHunt(id) {
    setSearches((prev) => prev.filter((s) => s.id !== id))
    try {
      await deleteSearch(id)
    } catch {
      /* ignore */
    }
  }

  const allTags = useMemo(() => {
    const s = new Set()
    items.forEach((i) => i.tags.forEach((t) => s.add(t)))
    return [...s].sort()
  }, [items])

  const counts = useMemo(() => {
    const c = {}
    for (const f of FOLDERS) c[f.id] = items.filter(f.test).length
    return c
  }, [items])

  const visible = useMemo(() => {
    const f = FOLDERS.find((x) => x.id === folder) || FOLDERS[0]
    const q = query.trim().toLowerCase()
    const band = scoreBand != null ? SCORE_BANDS[scoreBand] : null
    return items
      .filter(f.test)
      .filter((i) => (tag ? i.tags.includes(tag) : true))
      .filter((i) => (band ? band.test(effectiveScore(i)) : true))
      .filter((i) =>
        q ? `${i.title} ${i.brand || ''} ${i.model || ''} ${i.notes} ${i.tags.join(' ')}`.toLowerCase().includes(q) : true,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [items, folder, tag, scoreBand, query])

  const selected = items.find((i) => i.id === selectedId) || null

  function exportCSV() {
    const blob = new Blob([toCSV(items)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trailflip-catalogue-${todayStr()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // --- Select items to drop into a comparison ---
  const compareBoards = useMemo(() => (selectMode ? loadBoards(userId) : []), [selectMode, userId])
  function toggleSelect(item) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }
  function cancelSelect() {
    setSelectMode(false)
    setSelectedIds(new Set())
    setTargetBoard('')
  }
  function addSelectedToCompare() {
    const chosen = items.filter((i) => selectedIds.has(i.id))
    if (!chosen.length) return
    const candidates = chosen.map(candidateFromItem)
    const title = chosen.length === 1 ? chosen[0].title : `${chosen[0].brand || chosen[0].title} options`
    const boardId = addToBoard(userId, targetBoard || null, candidates, { title })
    cancelSelect()
    onOpenCompare?.(boardId)
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">🧰 My catalogue</h1>
          <p className="text-sm text-slate-500">Every deal you’ve scanned, owned, and flipped — and the profit behind it.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => (selectMode ? cancelSelect() : setSelectMode(true))} disabled={!items.length} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-40">
            {selectMode ? 'Cancel' : '⚖️ Compare'}
          </button>
          <button onClick={exportCSV} disabled={!items.length} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-40">
            ⬇ Export CSV
          </button>
          <button onClick={onScan} className="rounded-full bg-trail-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-trail-600">
            ✨ Scan a deal
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="mt-5">
          <PnL items={items} />
        </div>
      )}

      {/* Deal hunts — saved multi-marketplace searches */}
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-900">🔭 Deal hunts</p>
          <div className="flex gap-2">
            <button onClick={() => setScanHunt({ query: hunt.query, maxPrice: hunt.maxPrice })} className="rounded-full bg-trail-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-trail-600">
              ⚡ Scan eBay
            </button>
            <button onClick={() => setAddingHunt((v) => !v)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200">
              {addingHunt ? 'Cancel' : '+ New hunt'}
            </button>
          </div>
        </div>
        {addingHunt && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <input value={hunt.query} onChange={(e) => setHunt({ ...hunt, query: e.target.value })} placeholder="e.g. Santa Cruz Hightower" className="min-w-[12rem] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-forest-400 focus:bg-white" />
            <input type="number" min="0" value={hunt.maxPrice} onChange={(e) => setHunt({ ...hunt, maxPrice: e.target.value })} placeholder="max $" className="w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-forest-400 focus:bg-white" />
            <button onClick={() => addHunt()} disabled={!hunt.query.trim()} className="rounded-full bg-forest-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest-700 disabled:opacity-40">Save hunt</button>
          </div>
        )}
        {searches.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">Save the models you're hunting for — <span className="font-semibold text-slate-600">⚡ Scan</span> pulls live eBay results right here, and the marketplace links open Facebook/Craigslist/OfferUp under your max price.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {searches.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                <span className="text-sm font-semibold text-slate-800">{s.query}</span>
                {s.maxPrice != null && <span className="text-xs text-slate-500">under {currency(s.maxPrice)}</span>}
                <div className="ml-auto flex flex-wrap gap-1.5">
                  <button onClick={() => setScanHunt({ query: s.query, maxPrice: s.maxPrice })} className="rounded-full bg-trail-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-trail-600">⚡ Scan</button>
                  {marketplaceLinks(s).map((l) => (
                    <a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-forest-700 ring-1 ring-slate-200 transition hover:bg-forest-50">{l.name} ↗</a>
                  ))}
                  <button onClick={() => removeHunt(s.id)} className="rounded-full px-2 py-1 text-xs text-slate-400 transition hover:text-rose-500" aria-label="Delete hunt">×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Folder tabs */}
      <div className="mt-5 flex flex-wrap gap-2">
        {FOLDERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFolder(f.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              folder === f.id ? 'bg-forest-600 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {f.emoji} {f.label}
            <span className={`ml-1.5 ${folder === f.id ? 'text-white/70' : 'text-slate-400'}`}>{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {/* Custom tag chips */}
      {allTags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-400">Folders:</span>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTag(tag === t ? null : t)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                tag === t ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {/* Flip-score range filter */}
      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-slate-400">Flip score:</span>
          <button
            onClick={() => setScoreBand(null)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${scoreBand == null ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Any
          </button>
          {SCORE_BANDS.map((b) => (
            <button
              key={b.id}
              onClick={() => setScoreBand(scoreBand === b.id ? null : b.id)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${scoreBand === b.id ? 'bg-forest-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      {items.length > 0 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your catalogue…"
          className="mt-4 w-full max-w-md rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none transition focus:border-forest-400 focus:bg-white focus:ring-2 focus:ring-forest-100"
        />
      )}

      {/* Grid / empty states */}
      {items.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-slate-200 py-16 text-center">
          <span className="text-5xl">✨</span>
          <p className="text-lg font-bold text-slate-900">Scan your first deal</p>
          <p className="max-w-sm text-sm text-slate-500">
            Snap a photo of any gear — a Facebook listing or something at a garage sale — and TrailFlip identifies it, prices it, scores the flip, and saves it here.
          </p>
          <button onClick={onScan} className="mt-2 rounded-full bg-forest-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest-700">
            ✨ Scan a deal
          </button>
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-12 text-center text-sm text-slate-500">Nothing here yet.</p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onOpen={(i) => setSelectedId(i.id)}
              selectable={selectMode}
              selected={selectedIds.has(item.id)}
              onSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {selectMode && (
        <div className="sticky bottom-4 z-20 mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <span className="text-sm font-semibold text-slate-700">
            {selectedIds.size ? `${selectedIds.size} selected` : 'Tap items to compare'}
          </span>
          <select value={targetBoard} onChange={(e) => setTargetBoard(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <option value="">➕ New comparison</option>
            {compareBoards.map((b) => (
              <option key={b.id} value={b.id}>{b.title}</option>
            ))}
          </select>
          <button onClick={addSelectedToCompare} disabled={selectedIds.size === 0} className="ml-auto rounded-full bg-forest-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest-700 disabled:opacity-40">
            Add to comparison →
          </button>
        </div>
      )}

      {selected && (
        <ItemModal
          item={selected}
          userId={userId}
          onClose={() => setSelectedId(null)}
          onChange={onItemChange}
          onWatch={addHunt}
          onDelete={(id) => {
            onItemDelete(id)
            setSelectedId(null)
          }}
        />
      )}

      {scanHunt && (
        <DealScanner
          hunt={scanHunt}
          userId={userId}
          onClose={() => setScanHunt(null)}
          onEvaluateUrl={onEvaluateUrl}
          onSaved={(item) => onItemAdd?.(item)}
        />
      )}
    </section>
  )
}

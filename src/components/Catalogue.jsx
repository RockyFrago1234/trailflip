import { useMemo, useState } from 'react'
import ItemCard from './ItemCard'
import ItemModal from './ItemModal'
import { STATUS_META } from '../lib/items'
import { currency, portfolio, toCSV } from '../utils/format'

const FOLDERS = [
  { id: 'all', label: 'All', emoji: '🧰', test: () => true },
  { id: 'wishlist', label: 'Wishlist', emoji: STATUS_META.wishlist.emoji, test: (i) => i.status === 'wishlist' },
  { id: 'prospect', label: 'Prospects', emoji: STATUS_META.prospect.emoji, test: (i) => i.status === 'prospect' },
  { id: 'owned', label: 'Owned', emoji: STATUS_META.owned.emoji, test: (i) => i.status === 'owned' },
  { id: 'listed', label: 'Listed', emoji: STATUS_META.listed.emoji, test: (i) => i.status === 'listed' },
  { id: 'sold', label: 'Sold', emoji: STATUS_META.sold.emoji, test: (i) => i.status === 'sold' },
  { id: 'scans', label: 'All Scans', emoji: '🗂️', test: (i) => !!i.evaluation },
]

const todayStr = () => new Date().toISOString().slice(0, 10)

function PnL({ items }) {
  const p = portfolio(items)
  const cells = [
    { label: 'Tied up', value: currency(p.tiedUp) },
    { label: 'Realized profit', value: `${p.realized >= 0 ? '+' : ''}${currency(p.realized)}`, good: true },
    { label: 'Projected', value: `+${currency(p.projected)}` },
    { label: 'Flips closed', value: String(p.soldCount) },
    { label: 'Avg hold', value: p.avgHold != null ? `${p.avgHold}d` : '—' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {cells.map((c) => (
        <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">{c.label}</p>
          <p className={`text-lg font-extrabold ${c.good ? 'text-forest-700' : 'text-slate-900'}`}>{c.value}</p>
        </div>
      ))}
    </div>
  )
}

export default function Catalogue({ items, userId, onItemChange, onItemDelete, onScan }) {
  const [folder, setFolder] = useState('all')
  const [tag, setTag] = useState(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)

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
    return items
      .filter(f.test)
      .filter((i) => (tag ? i.tags.includes(tag) : true))
      .filter((i) =>
        q ? `${i.title} ${i.brand || ''} ${i.model || ''} ${i.notes} ${i.tags.join(' ')}`.toLowerCase().includes(q) : true,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [items, folder, tag, query])

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

  return (
    <section className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">🧰 My catalogue</h1>
          <p className="text-sm text-slate-500">Every deal you’ve scanned, owned, and flipped — and the profit behind it.</p>
        </div>
        <div className="flex gap-2">
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
            <ItemCard key={item.id} item={item} onOpen={(i) => setSelectedId(i.id)} />
          ))}
        </div>
      )}

      {selected && (
        <ItemModal
          item={selected}
          userId={userId}
          onClose={() => setSelectedId(null)}
          onChange={onItemChange}
          onDelete={(id) => {
            onItemDelete(id)
            setSelectedId(null)
          }}
        />
      )}
    </section>
  )
}

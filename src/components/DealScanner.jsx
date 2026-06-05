import { useEffect, useRef, useState } from 'react'
import { Close } from './icons'
import { scanMarketplace } from '../lib/scan'
import { createItem, guessCategory } from '../lib/items'
import { marketplaceLinks } from '../lib/searches'
import { currency } from '../utils/format'

const fieldCls =
  'rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-forest-400 focus:bg-white focus:ring-2 focus:ring-forest-100'

// Shown until eBay keys are added — turns a config gap into a clear next step.
function SetupCard() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">🔑 Connect eBay to scan (free, ~5 min — one time)</p>
      <p className="mt-1 text-amber-800">
        Live scanning runs on eBay's official API — sanctioned and reliable (unlike Craigslist/Facebook, which block automated requests). It just needs a free developer key:
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-amber-800">
        <li>Go to <span className="font-semibold">developer.ebay.com</span> → sign in with your eBay account → join the developer program (free).</li>
        <li>Create a <span className="font-semibold">Production</span> keyset → copy the <span className="font-semibold">App ID</span> (Client ID) and <span className="font-semibold">Cert ID</span> (Client Secret).</li>
        <li>Add them as <span className="font-mono text-xs">EBAY_APP_ID</span> and <span className="font-mono text-xs">EBAY_CERT_ID</span> in Vercel → Settings → Environment Variables.</li>
        <li>Redeploy — then scanning lights up right here.</li>
      </ol>
    </div>
  )
}

function ResultRow({ r, maxPrice, saved, saving, onSave, onEvaluate, comps }) {
  const under = maxPrice != null && r.price != null && r.price <= maxPrice
  return (
    <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
        {r.image ? (
          <img src={r.image} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full w-full place-items-center text-2xl">🛒</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold text-slate-900">{r.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          <span className={`text-sm font-extrabold ${comps ? 'text-slate-900' : under ? 'text-forest-700' : 'text-slate-900'}`}>
            {r.price != null ? currency(r.price) : '—'}
          </span>
          {comps && r.soldDate && <span className="font-medium text-forest-700">sold {new Date(r.soldDate).toLocaleDateString()}</span>}
          {!comps && r.auction && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">auction</span>}
          {r.condition && <span>{r.condition}</span>}
          {!comps && r.where && <span className="truncate">· {r.where}</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.url && (
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
            >
              Open ↗
            </a>
          )}
          {!comps && (
            <>
              <button
                onClick={() => onEvaluate(r)}
                className="rounded-full bg-trail-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-trail-600"
              >
                ✨ Evaluate
              </button>
              <button
                onClick={() => onSave(r)}
                disabled={saved || saving}
                className="rounded-full bg-forest-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-forest-700 disabled:opacity-50"
              >
                {saved ? '✓ Saved' : saving ? 'Saving…' : '+ Save'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DealScanner({ hunt, userId, onClose, onEvaluateUrl, onSaved }) {
  const [query, setQuery] = useState(hunt?.query || '')
  const [maxPrice, setMaxPrice] = useState(hunt?.maxPrice != null ? String(hunt.maxPrice) : '')
  const [sort, setSort] = useState('newest')
  const [tab, setTab] = useState('active') // 'active' | 'sold'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [savedIds, setSavedIds] = useState(() => new Set())
  const [savingId, setSavingId] = useState(null)
  const autoRan = useRef(false)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  async function runScan(t = tab) {
    const q = query.trim()
    if (!q || loading) return
    setLoading(true)
    setError('')
    setData(null)
    try {
      const res = await scanMarketplace({
        source: t === 'sold' ? 'ebay-sold' : 'ebay',
        query: q,
        maxPrice: maxPrice === '' ? null : Number(maxPrice),
        sort,
      })
      setData(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Auto-scan when opened from a saved hunt.
  useEffect(() => {
    if (!autoRan.current && (hunt?.query || '').trim()) {
      autoRan.current = true
      runScan()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveProspect(r) {
    if (!userId || savedIds.has(r.id)) return
    setSavingId(r.id)
    setError('')
    try {
      const item = await createItem(userId, {
        status: 'prospect',
        title: r.title,
        category: guessCategory(r.title),
        askingPrice: r.price ?? null,
        condition: r.conditionBucket || 'Good',
        sourceUrl: r.url,
        buySource: r.source,
        photos: r.image ? [r.image] : [],
      })
      setSavedIds((prev) => new Set(prev).add(r.id))
      onSaved?.(item)
    } catch (e) {
      setError(e.message || 'Could not save that one.')
    } finally {
      setSavingId(null)
    }
  }

  function evaluate(r) {
    onEvaluateUrl?.(r.url)
    onClose()
  }

  const listings = data?.listings || []

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
            <h2 className="text-lg font-extrabold text-slate-900">⚡ Scan marketplaces</h2>
            <p className="text-sm text-slate-500">Live eBay listings → evaluate or save the good ones to your catalogue.</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100"
            aria-label="Close"
          >
            <Close />
          </button>
        </div>

        {/* Controls */}
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="mb-3 flex gap-1 rounded-full bg-slate-100 p-1 sm:w-80">
            <button onClick={() => { setTab('active'); runScan('active') }} className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition ${tab === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>🟢 Active</button>
            <button onClick={() => { setTab('sold'); runScan('sold') }} className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition ${tab === 'sold' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>📊 Sold comps</button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">Search</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runScan()}
                placeholder="e.g. Santa Cruz Hightower"
                className={fieldCls}
              />
            </label>
            <label className="flex w-24 flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">Max $</span>
              <input
                type="number"
                min="0"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runScan()}
                placeholder="any"
                className={fieldCls}
              />
            </label>
            <button
              onClick={runScan}
              disabled={!query.trim() || loading}
              className="rounded-full bg-forest-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest-700 disabled:opacity-50"
            >
              {loading ? 'Scanning…' : '⚡ Scan'}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-400">Sort:</span>
            {[
              { id: 'newest', label: 'Newest' },
              { id: 'price', label: 'Cheapest' },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setSort(s.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                  sort === s.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {s.label}
              </button>
            ))}
            <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">🛒 eBay</span>
          </div>
        </div>

        {/* Results */}
        <div className="grid gap-3 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center gap-2 py-10 text-slate-500">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-forest-600" />
              <p className="text-sm">Searching eBay…</p>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              <p className="font-semibold">Couldn’t scan: {error}</p>
              <p className="mt-2 text-rose-600">You can still search manually:</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {marketplaceLinks({ query, maxPrice }).map((l) => (
                  <a
                    key={l.name}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-forest-700 ring-1 ring-slate-200 transition hover:bg-forest-50"
                  >
                    {l.name} ↗
                  </a>
                ))}
              </div>
            </div>
          )}

          {!loading && !error && data && !data.configured && <SetupCard />}

          {!loading && !error && data?.note && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{data.note}</div>
          )}

          {!loading && !error && data?.summary && (
            <div className="rounded-2xl border border-forest-200 bg-forest-50 p-3 text-sm text-forest-900">
              <b>Sold comps</b> · avg {currency(data.summary.avg)} · median {currency(data.summary.median)} · {currency(data.summary.low)}–{currency(data.summary.high)} · {data.summary.count} recent sales
            </div>
          )}

          {!loading && !error && data && data.configured && listings.length === 0 && !data.note && (
            <p className="py-10 text-center text-sm text-slate-500">
              No {tab === 'sold' ? 'recent sales' : 'eBay listings'}{maxPrice ? ` under ${currency(Number(maxPrice))}` : ''} for “{data.query}”. Try widening the price or wording.
            </p>
          )}

          {!loading && !error && listings.length > 0 && (
            <>
              <p className="text-xs text-slate-400">
                {listings.length} shown{data.total ? ` of ~${data.total.toLocaleString('en-US')}` : ''} · newest first
              </p>
              {listings.map((r) => (
                <ResultRow
                  key={r.id}
                  r={r}
                  maxPrice={maxPrice === '' ? null : Number(maxPrice)}
                  saved={savedIds.has(r.id)}
                  saving={savingId === r.id}
                  onSave={saveProspect}
                  onEvaluate={evaluate}
                />
              ))}
            </>
          )}

          {!data && !loading && !error && (
            <p className="py-10 text-center text-sm text-slate-500">Enter a search and hit ⚡ Scan to pull live eBay deals.</p>
          )}
        </div>
      </div>
    </div>
  )
}

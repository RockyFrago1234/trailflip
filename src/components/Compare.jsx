import { useEffect, useRef, useState } from 'react'
import { loadBoards, saveBoards, newBoard, newCandidate, runComparison } from '../lib/compare'
import { fileToResizedDataURL } from '../lib/resizeImage'
import { uploadListingPhotos } from '../lib/items'
import { currency } from '../utils/format'

const CONDITIONS = ['', 'New', 'Like New', 'Good', 'Fair']
const RANK_BADGE = ['🥇', '🥈', '🥉']
const fieldCls =
  'rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-forest-400 focus:bg-white focus:ring-2 focus:ring-forest-100'

function ratingColor(r) {
  if (r >= 70) return 'bg-forest-600'
  if (r >= 40) return 'bg-amber-400'
  return 'bg-rose-400'
}
const RISK = {
  low: 'bg-forest-100 text-forest-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-rose-100 text-rose-700',
}

function evalValue(e) {
  if (!e) return null
  if (e.used_low_usd != null && e.used_high_usd != null) return (e.used_low_usd + e.used_high_usd) / 2
  return e.used_high_usd ?? e.used_low_usd ?? null
}

function CandidateCard({ c, isBest, onPatch, onRemove }) {
  const e = c.evaluation
  const ai = c.ai
  return (
    <div className={`rounded-2xl border bg-white p-3 ${isBest ? 'border-forest-400 ring-2 ring-forest-100' : 'border-slate-200'}`}>
      <div className="flex gap-3">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100">
          {c.image ? (
            <img src={c.image} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="grid h-full w-full place-items-center text-2xl">📦</div>
          )}
          {ai && (
            <span className="absolute left-1 top-1 rounded-full bg-slate-900/85 px-1.5 py-0.5 text-xs font-bold text-white">
              {RANK_BADGE[ai.rank - 1] || `#${ai.rank}`}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <input
              value={c.title}
              onChange={(ev) => onPatch({ title: ev.target.value })}
              className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
            />
            <button onClick={onRemove} className="shrink-0 rounded-full px-1.5 text-slate-400 transition hover:text-rose-500" aria-label="Remove">×</button>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400">$</span>
            <input
              type="number" min="0" value={c.price ?? ''} placeholder="price"
              onChange={(ev) => onPatch({ price: ev.target.value === '' ? null : Number(ev.target.value) })}
              className={`${fieldCls} w-24 px-2 py-1`}
            />
            <input
              value={c.location} placeholder="location"
              onChange={(ev) => onPatch({ location: ev.target.value })}
              className={`${fieldCls} w-32 px-2 py-1`}
            />
            <select value={c.condition} onChange={(ev) => onPatch({ condition: ev.target.value })} className={`${fieldCls} px-2 py-1`}>
              {CONDITIONS.map((o) => <option key={o} value={o}>{o || 'Condition?'}</option>)}
            </select>
            {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-forest-700 hover:underline">open ↗</a>}
          </div>

          {e && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
              {e.deal_score != null && <span className="rounded-full bg-slate-900 px-2 py-0.5 font-bold text-white">flip {e.deal_score}</span>}
              {evalValue(e) != null && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">≈ {currency(evalValue(e))} resale</span>}
              {e.confidence && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500">{e.confidence} confidence</span>}
            </div>
          )}
        </div>
      </div>

      {ai && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full ${ratingColor(ai.rating)}`} style={{ width: `${ai.rating}%` }} />
            </div>
            <span className="text-sm font-extrabold text-slate-900">{ai.rating}</span>
            {ai.risk && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${RISK[ai.risk] || RISK.medium}`}>{ai.risk} risk</span>}
          </div>
          <p className="mt-1.5 text-sm font-medium text-slate-700">{ai.verdict}</p>
          {(ai.pros?.length || ai.cons?.length) && (
            <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
              <ul className="space-y-0.5">
                {(ai.pros || []).map((p, i) => <li key={i} className="text-xs text-forest-700">＋ {p}</li>)}
              </ul>
              <ul className="space-y-0.5">
                {(ai.cons || []).map((p, i) => <li key={i} className="text-xs text-rose-600">－ {p}</li>)}
              </ul>
            </div>
          )}
          {ai.specs?.some((s) => s.value && s.value !== '—') && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ai.specs.filter((s) => s.value && s.value !== '—').map((s, i) => (
                <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  <b className="font-semibold text-slate-700">{s.label}:</b> {s.value}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CompareTable({ candidates, bestId, specKeys = [] }) {
  const headers = ['Listing', 'Price', 'Location', 'Condition', ...specKeys, 'Resale', 'Flip', 'Rating', 'Rank']
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => {
            const e = c.evaluation
            const best = c.id === bestId
            const specMap = Object.fromEntries((c.ai?.specs || []).map((s) => [s.label, s.value]))
            return (
              <tr key={c.id} className={`border-b border-slate-50 ${best ? 'bg-forest-50' : ''}`}>
                <td className="max-w-[12rem] truncate px-3 py-2 font-medium text-slate-800">{best ? '⭐ ' : ''}{c.title}</td>
                <td className="px-3 py-2 font-semibold">{c.price != null ? currency(c.price) : '—'}</td>
                <td className="px-3 py-2 text-slate-600">{c.location || '—'}</td>
                <td className="px-3 py-2 text-slate-600">{c.condition || '—'}</td>
                {specKeys.map((k) => (
                  <td key={k} className="px-3 py-2 text-slate-600">{specMap[k] || '—'}</td>
                ))}
                <td className="px-3 py-2 text-slate-600">{evalValue(e) != null ? currency(evalValue(e)) : '—'}</td>
                <td className="px-3 py-2">{e?.deal_score ?? '—'}</td>
                <td className="px-3 py-2 font-bold">{c.ai?.rating ?? '—'}</td>
                <td className="px-3 py-2">{c.ai ? (RANK_BADGE[c.ai.rank - 1] || `#${c.ai.rank}`) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function Compare({ userId, openBoardId = null }) {
  const [boards, setBoards] = useState(() => loadBoards(userId))
  const [activeId, setActiveId] = useState(openBoardId)
  const [form, setForm] = useState({ title: '', target: '' })
  const [addMode, setAddMode] = useState('upload')
  const [urlInput, setUrlInput] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const dataUrls = useRef({})
  const fileRef = useRef(null)

  // Persist whenever boards change.
  useEffect(() => {
    saveBoards(userId, boards)
  }, [userId, boards])

  const active = boards.find((b) => b.id === activeId) || null

  function updateActive(updater) {
    setBoards((prev) => prev.map((b) => (b.id === activeId ? { ...updater(b), updatedAt: Date.now() } : b)))
  }
  function createBoard() {
    if (!form.title.trim()) return
    const b = newBoard(form)
    setBoards((prev) => [b, ...prev])
    setActiveId(b.id)
    setForm({ title: '', target: '' })
  }
  function deleteBoard(id) {
    setBoards((prev) => prev.filter((b) => b.id !== id))
    if (activeId === id) setActiveId(null)
  }
  function addCandidate(cand) {
    updateActive((b) => ({ ...b, candidates: [...b.candidates, cand], result: null }))
  }
  function patchCandidate(id, patch) {
    updateActive((b) => ({ ...b, candidates: b.candidates.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
  }
  function removeCandidate(id) {
    delete dataUrls.current[id]
    updateActive((b) => ({ ...b, candidates: b.candidates.filter((c) => c.id !== id) }))
  }

  function addUrl() {
    const url = urlInput.trim()
    if (!/^https?:\/\/.+/i.test(url)) return
    addCandidate(newCandidate({ url }))
    setUrlInput('')
  }

  async function addUploads(files) {
    setError('')
    for (const file of files) {
      try {
        const dataUrl = await fileToResizedDataURL(file)
        let image = dataUrl
        try {
          const [u] = await uploadListingPhotos(userId, [dataUrl])
          if (u) image = u
        } catch {
          /* keep the data URL if upload fails */
        }
        const cand = newCandidate({ image })
        dataUrls.current[cand.id] = dataUrl
        addCandidate(cand)
      } catch {
        setError('Could not read one of those images.')
      }
    }
  }

  async function compareNow() {
    if (!active || active.candidates.length < 2 || running) return
    setRunning(true)
    setError('')
    setProgress('Starting…')
    try {
      const { candidates, result } = await runComparison(active, { onProgress: setProgress, dataUrls: dataUrls.current })
      updateActive((b) => ({ ...b, candidates, result }))
    } catch (e) {
      setError(e.message || 'Comparison failed.')
    } finally {
      setRunning(false)
      setProgress('')
    }
  }

  // ---- Board list ----
  if (!active) {
    return (
      <section className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-extrabold text-slate-900">⚖️ Compare deals</h1>
        <p className="text-sm text-slate-500">Shopping for one thing across many listings? Add them here and let AI rank the best buy.</p>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-bold text-slate-900">New comparison</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What you're buying — e.g. Honda EU2200i generator" className={fieldCls} />
            <input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="What matters (optional) — e.g. closest, must run quiet" className={fieldCls} />
            <button onClick={createBoard} disabled={!form.title.trim()} className="rounded-full bg-forest-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest-700 disabled:opacity-40">
              Create
            </button>
          </div>
        </div>

        {boards.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-slate-200 py-14 text-center">
            <span className="text-5xl">⚖️</span>
            <p className="text-lg font-bold text-slate-900">No comparisons yet</p>
            <p className="max-w-sm text-sm text-slate-500">Create one above, drop in the listings you're weighing, and TrailFlip will rate and rank them for you.</p>
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {boards.map((b) => {
              const best = b.result && b.candidates.find((c) => c.id === b.result.bestId)
              return (
                <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => setActiveId(b.id)} className="text-left">
                      <p className="font-bold text-slate-900">{b.title}</p>
                      {b.target && <p className="text-xs text-slate-500">{b.target}</p>}
                    </button>
                    <button onClick={() => deleteBoard(b.id)} className="rounded-full px-2 text-slate-400 transition hover:text-rose-500" aria-label="Delete">×</button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium">{b.candidates.length} listings</span>
                    {best && <span className="rounded-full bg-forest-100 px-2 py-0.5 font-semibold text-forest-700">🥇 {best.title}</span>}
                  </div>
                  <button onClick={() => setActiveId(b.id)} className="mt-3 w-full rounded-full bg-slate-100 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
                    Open →
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    )
  }

  // ---- Board detail ----
  const sorted = active.candidates
  return (
    <section className="mx-auto max-w-5xl px-4 py-6">
      <button onClick={() => setActiveId(null)} className="text-sm font-semibold text-slate-500 transition hover:text-slate-800">← All comparisons</button>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{active.title}</h1>
          {active.target && <p className="text-sm text-slate-500">Goal: {active.target}</p>}
        </div>
        <div className="flex items-center gap-2">
          {running && <span className="text-xs text-slate-500">{progress}</span>}
          <button
            onClick={compareNow}
            disabled={active.candidates.length < 2 || running}
            className="rounded-full bg-trail-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-trail-600 disabled:opacity-40"
            title={active.candidates.length < 2 ? 'Add at least two listings' : ''}
          >
            {running ? 'Working…' : '🤖 Compare with AI'}
          </button>
        </div>
      </div>

      {/* Add a candidate */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex gap-1 rounded-full bg-slate-100 p-1 sm:w-72">
          {[['upload', '📷 Upload'], ['url', '🔗 URL']].map(([id, label]) => (
            <button key={id} onClick={() => setAddMode(id)} className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition ${addMode === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {addMode === 'upload' ? (
          <div className="mt-3">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addUploads([...e.target.files]); e.target.value = '' }} />
            <button onClick={() => fileRef.current?.click()} className="w-full rounded-xl border-2 border-dashed border-slate-200 py-6 text-sm font-medium text-slate-500 transition hover:border-forest-300 hover:text-forest-700">
              📷 Upload listing screenshots (add several at once)
            </button>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addUrl()} placeholder="Paste a listing URL (eBay, etc.)" className={`${fieldCls} flex-1`} />
            <button onClick={addUrl} disabled={!/^https?:\/\/.+/i.test(urlInput.trim())} className="rounded-full bg-forest-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest-700 disabled:opacity-40">Add</button>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-400">Add the listings you're weighing, then hit <span className="font-semibold text-slate-500">🤖 Compare with AI</span> — it appraises each and ranks the best buy.</p>
      </div>

      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {/* Overall recommendation */}
      {active.result?.overall && (
        <div className="mt-4 rounded-2xl border border-forest-200 bg-forest-50 p-4">
          <p className="text-sm font-bold text-forest-800">🤖 TrailFlip's take</p>
          <p className="mt-1 text-sm text-forest-900">{active.result.overall}</p>
        </div>
      )}

      {/* Candidates */}
      {active.candidates.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-500">No listings yet — add a few above.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3">
            {sorted.map((c) => (
              <CandidateCard
                key={c.id}
                c={c}
                isBest={active.result?.bestId === c.id}
                onPatch={(patch) => patchCandidate(c.id, patch)}
                onRemove={() => removeCandidate(c.id)}
              />
            ))}
          </div>

          {active.candidates.length >= 2 && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-bold text-slate-900">Side by side</p>
              <CompareTable candidates={sorted} bestId={active.result?.bestId} specKeys={active.result?.specKeys || []} />
            </div>
          )}
        </>
      )}
    </section>
  )
}

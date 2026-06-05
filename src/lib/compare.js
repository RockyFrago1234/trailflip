// Comparison "boards" — a buyer's decision tool. Each board holds several
// candidate listings for the SAME item; the AI evaluates and ranks them.
//
// Stored in localStorage (per user): comparison sets are short-lived shopping
// sessions, so this ships with zero migration. Uploaded screenshots live in
// Supabase Storage (small URL strings), keeping localStorage lean.

const KEY = (userId) => `trailflip:compare:${userId || 'anon'}`

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function loadBoards(userId) {
  try {
    const raw = localStorage.getItem(KEY(userId))
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function saveBoards(userId, boards) {
  try {
    localStorage.setItem(KEY(userId), JSON.stringify(boards))
  } catch {
    /* quota / private mode — boards stay in memory for the session */
  }
}

export function newBoard({ title, target }) {
  const now = Date.now()
  return { id: uid(), title: title?.trim() || 'Untitled comparison', target: target?.trim() || '', candidates: [], result: null, createdAt: now, updatedAt: now }
}

export function newCandidate({ title, url = null, image = null, price = null, location = '', condition = '' }) {
  return { id: uid(), title: title || (url ? hostOf(url) : 'New listing'), url, image, price, location, condition, evaluation: null, ai: null }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'listing'
  }
}

// Turn a catalogue item into a comparison candidate. Reuses the item's saved
// AI evaluation, so a scanned listing is compared without re-appraising it.
export function candidateFromItem(item) {
  const cover = item.photos?.[0] || item.officialPhotos?.[0] || item.representativePhotos?.[0] || null
  const price = item.status === 'sold' ? item.soldPrice : item.askingPrice ?? item.listPrice ?? item.buyPrice ?? null
  return {
    id: uid(),
    title: item.title || [item.brand, item.model].filter(Boolean).join(' ') || 'Catalogue item',
    url: item.sourceUrl || null,
    image: cover,
    price: price ?? null,
    location: '',
    condition: item.condition || '',
    evaluation: item.evaluation || null,
    ai: null,
    fromItemId: item.id,
  }
}

// Append candidates to a board (creating one if boardId is null/missing).
// Operates directly on localStorage; returns the board id to open.
export function addToBoard(userId, boardId, candidates, { title } = {}) {
  const boards = loadBoards(userId)
  let board = boardId ? boards.find((b) => b.id === boardId) : null
  if (!board) {
    board = newBoard({ title: title || 'Catalogue comparison', target: '' })
    boards.unshift(board)
  }
  board.candidates = [...board.candidates, ...candidates]
  board.result = null
  board.updatedAt = Date.now()
  saveBoards(userId, boards)
  return board.id
}

// Evaluate any un-appraised candidates, then ask the AI to rank them all.
// `dataUrls` maps candidate id -> in-session screenshot data URL (best quality).
export async function runComparison(board, { onProgress, dataUrls = {} } = {}) {
  const candidates = board.candidates.map((c) => ({ ...c }))

  await Promise.all(
    candidates.map(async (c) => {
      if (c.evaluation) return
      const payload = dataUrls[c.id]
        ? { image: dataUrls[c.id] }
        : c.image
          ? { imageUrl: c.image }
          : c.url
            ? { url: c.url }
            : null
      if (!payload) return
      onProgress?.(`Evaluating ${c.title}…`)
      try {
        const resp = await fetch('/api/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await resp.json()
        if (resp.ok && data.evaluation) {
          c.evaluation = data.evaluation
          if (c.price == null && data.evaluation.listed_price_usd != null) c.price = data.evaluation.listed_price_usd
          const id = [data.evaluation.brand, data.evaluation.model, data.evaluation.year].filter(Boolean).join(' ')
          if (id && (!c.title || c.title === 'New listing' || c.title === hostOf(c.url || ''))) c.title = id
        }
      } catch {
        /* leave unevaluated; it can still be compared on basics */
      }
    }),
  )

  onProgress?.('Comparing & ranking…')
  const resp = await fetch('/api/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target: board.target || board.title,
      candidates: candidates.map((c) => ({
        id: c.id,
        title: c.title,
        price: c.price ?? null,
        location: c.location || null,
        condition: c.condition || null,
        evaluation: c.evaluation || null,
      })),
    }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error || 'Comparison failed.')

  const byId = Object.fromEntries((data.rankings || []).map((r) => [r.id, r]))
  const ranked = candidates
    .map((c) => ({ ...c, ai: byId[c.id] || null }))
    .sort((a, b) => (a.ai?.rank ?? 99) - (b.ai?.rank ?? 99))

  return { candidates: ranked, result: { overall: data.overall, bestId: data.best_id, ts: Date.now() } }
}

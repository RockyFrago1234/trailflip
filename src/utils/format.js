// Small formatting + deal-math helpers shared across the app.

export function currency(n) {
  if (n === null || n === undefined) return '—'
  return '$' + Math.round(n).toLocaleString('en-US')
}

export function timeAgo(ts) {
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  return `${weeks}w ago`
}

// The heart of TrailFlip: turn buy price + estimated resale into a flip score.
// tier: 'hot' (>=60% margin) | 'good' (>=25%) | 'none'
export function dealInfo(listing) {
  const price = listing.price
  const est = listing.estResale
  if (!price || !est || est <= price) {
    return { profit: 0, marginPct: 0, score: 0, tier: 'none' }
  }
  const profit = est - price
  const marginPct = (profit / price) * 100
  const score = Math.max(1, Math.min(99, Math.round(marginPct)))
  let tier = 'none'
  if (marginPct >= 60) tier = 'hot'
  else if (marginPct >= 25) tier = 'good'
  return { profit, marginPct, score, tier }
}

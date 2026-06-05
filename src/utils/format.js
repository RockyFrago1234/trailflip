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

// IRS standard mileage rate (USD/mi) for the deduction estimate.
// NOTE: verify the current-year rate before filing — this is an editable estimate.
export const MILEAGE_RATE = 0.7

// Best single estimate of an item's resale value.
export function midValue(item) {
  const { usedLow: lo, usedHigh: hi } = item
  if (lo != null && hi != null) return (lo + hi) / 2
  if (hi != null) return hi
  if (lo != null) return lo
  if (item.listPrice != null) return item.listPrice
  return item.msrp != null ? item.msrp * 0.55 : 0
}

// Lifecycle-aware money math for one catalogue item.
// realized: locked-in profit (sold). projected: expected profit (owned/listed).
// spread: potential profit if bought at asking and sold mid (wishlist/prospect).
export function itemMath(item) {
  const mid = midValue(item)
  const out = { mid, invested: 0, realized: 0, gross: 0, costs: 0, mileageDeduction: 0, projected: 0, spread: 0, marginPct: 0, holdDays: null }

  if (item.status === 'sold') {
    out.invested = item.buyPrice || 0
    out.gross = (item.soldPrice || 0) - (item.buyPrice || 0)
    out.costs = (item.fees || 0) + (item.shippingCost || 0) + (item.suppliesCost || 0)
    out.realized = out.gross - out.costs // true cash profit after fees/shipping/supplies
    out.mileageDeduction = (item.miles || 0) * MILEAGE_RATE
    out.marginPct = item.buyPrice ? (out.realized / item.buyPrice) * 100 : 0
    if (item.boughtAt && item.soldAt) out.holdDays = Math.max(0, Math.round((item.soldAt - item.boughtAt) / 86400000))
  } else if (item.status === 'owned' || item.status === 'listed') {
    out.invested = item.buyPrice || 0
    const exit = item.listPrice ?? mid
    out.projected = exit && item.buyPrice != null ? exit - item.buyPrice : 0
    out.marginPct = item.buyPrice ? (out.projected / item.buyPrice) * 100 : 0
    if (item.boughtAt) out.holdDays = Math.max(0, Math.round((Date.now() - item.boughtAt) / 86400000))
  } else {
    const cost = item.askingPrice
    out.spread = cost != null && mid ? mid - cost : 0
    out.marginPct = cost ? (out.spread / cost) * 100 : 0
  }
  return out
}

// Cost-adjusted flip score. The evaluator's score (item.flipScore) is anchored
// at the ASKING price; once you actually buy below asking, your real margin is
// better, so the score rises toward 100. Score never drops below the baseline.
// Uses a saturating curve calibrated to pass through the baseline at the asking
// price: score(margin) = 100·margin / (margin + k).
export function effectiveScore(item) {
  const base = item.flipScore
  if (base == null) return null
  if (item.buyPrice == null || item.askingPrice == null || item.buyPrice >= item.askingPrice) return base

  const resale = midValue(item)
  if (!(resale > 0) || item.buyPrice <= 0) return base
  const marginBuy = ((resale - item.buyPrice) / item.buyPrice) * 100
  if (marginBuy <= 0) return base

  const marginAsk = ((resale - item.askingPrice) / item.askingPrice) * 100
  if (base <= 0 || marginAsk <= 0) {
    // Asking was at/above resale (or no baseline) — map margin directly.
    return Math.max(base, Math.min(99, Math.round((100 * marginBuy) / (marginBuy + 50))))
  }
  const k = (marginAsk * (100 - base)) / base
  const score = (100 * marginBuy) / (marginBuy + k)
  return Math.max(base, Math.min(100, Math.round(score)))
}

// Aggregate P&L across the catalogue, for the finance strip + LLC books.
export function portfolio(items) {
  let tiedUp = 0, realized = 0, costs = 0, mileageDeduction = 0, projected = 0, soldCount = 0, holdSum = 0, holdN = 0
  const byStatus = {}
  for (const it of items) {
    byStatus[it.status] = (byStatus[it.status] || 0) + 1
    const m = itemMath(it)
    if (it.status === 'sold') {
      realized += m.realized
      costs += m.costs
      mileageDeduction += m.mileageDeduction
      soldCount += 1
      if (m.holdDays != null) { holdSum += m.holdDays; holdN += 1 }
    } else if (it.status === 'owned' || it.status === 'listed') {
      tiedUp += m.invested
      projected += m.projected
    }
  }
  return {
    tiedUp,
    realized, // net of fees/shipping/supplies
    costs,
    mileageDeduction,
    projected,
    soldCount,
    avgHold: holdN ? Math.round(holdSum / holdN) : null,
    byStatus,
    count: items.length,
  }
}

function csvCell(v) {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const isoDay = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '')

// Catalogue -> CSV string for the LLC / tax books.
export function toCSV(items) {
  const cols = [
    'Title', 'Brand', 'Model', 'Year', 'Category', 'Status',
    'Asking', 'Bought', 'Buy date', 'Source', 'Listed', 'Sold', 'Sold date',
    'Fees', 'Shipping', 'Supplies', 'Gross profit', 'Net profit', 'Margin %',
    'Hold days', 'Miles', 'Mileage deduction', 'Tags',
  ]
  const rows = items.map((it) => {
    const m = itemMath(it)
    return [
      it.title, it.brand, it.model, it.year, it.category, it.status,
      it.askingPrice, it.buyPrice, isoDay(it.boughtAt), it.buySource,
      it.listPrice, it.soldPrice, isoDay(it.soldAt),
      it.fees ?? '', it.shippingCost ?? '', it.suppliesCost ?? '',
      it.status === 'sold' ? Math.round(m.gross) : '',
      it.status === 'sold' ? Math.round(m.realized) : '',
      Math.round(m.marginPct),
      m.holdDays ?? '',
      it.miles ?? '',
      it.miles ? Math.round(it.miles * MILEAGE_RATE) : '',
      (it.tags || []).join('; '),
    ].map(csvCell).join(',')
  })
  return [cols.join(','), ...rows].join('\n')
}

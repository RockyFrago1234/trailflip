// "Is my money sitting?" intelligence for held items (owned/listed).
// Pure — derived from the lifecycle dates already on each item.

import { currency, midValue } from './format'

const DAY = 86400000

export const AGING_RANK = { cold: 3, stale: 2, watch: 1, fresh: 0 }
export const AGING_STYLE = {
  watch: 'bg-sky-100 text-sky-700',
  stale: 'bg-amber-100 text-amber-700',
  cold: 'bg-rose-100 text-rose-700',
  fresh: 'bg-slate-100 text-slate-500',
}

// level: fresh → watch → stale → cold, with a concrete next move (and, where it
// helps, a suggested repricing target).
export function aging(item, now = Date.now()) {
  const r = { holdDays: null, level: 'fresh', action: null, suggestedPrice: null }
  if (item.status !== 'owned' && item.status !== 'listed') return r

  const since = item.status === 'listed' ? (item.listedAt ?? item.boughtAt) : item.boughtAt
  r.holdDays = since ? Math.max(0, Math.round((now - since) / DAY)) : null
  if (r.holdDays == null) return r
  const capital = item.buyPrice || 0

  if (item.status === 'owned') {
    if (r.holdDays >= 14) {
      r.level = r.holdDays >= 45 ? 'cold' : 'watch'
      r.action = `Owned ${r.holdDays}d but not listed — list it to put ${currency(capital)} back to work.`
    }
    return r
  }

  // listed
  const price = item.listPrice ?? midValue(item)
  if (r.holdDays >= 75) {
    r.level = 'cold'
    const floor = item.usedLow ?? Math.round(price * 0.8)
    r.suggestedPrice = Math.max(0, Math.round(Math.min(price, floor)))
    r.action = `Listed ${r.holdDays}d with no sale — drop toward a quick-sale price or relist fresh.`
  } else if (r.holdDays >= 45) {
    r.level = 'stale'
    r.suggestedPrice = Math.round(price * 0.9)
    r.action = `Listed ${r.holdDays}d — a ~10% price drop usually breaks the stall.`
  } else if (r.holdDays >= 21) {
    r.level = 'watch'
    r.action = `Listed ${r.holdDays}d — bump or re-share it to resurface.`
  }
  return r
}

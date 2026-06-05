// Business-intelligence aggregates for the Books tab. Pure functions over the
// catalogue, expense-aware (pass the itemId→expense map so figures match the
// rest of the app). Date math lives here, not in component render/memo.

import { itemMath } from './format'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Realized net profit per month for the last `n` months (oldest first).
export function monthlyProfit(items, expenseMap = {}, n = 12) {
  const now = new Date()
  const buckets = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()], total: 0, count: 0 })
  }
  const idx = Object.fromEntries(buckets.map((b, i) => [b.key, i]))
  for (const it of items) {
    if (it.status !== 'sold' || !it.soldAt) continue
    const d = new Date(it.soldAt)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (key in idx) {
      const b = buckets[idx[key]]
      b.total += itemMath(it, expenseMap[it.id] || 0).realized
      b.count += 1
    }
  }
  return buckets.map((b) => ({ ...b, total: Math.round(b.total) }))
}

// Where the money actually comes from: realized profit + margin by category.
export function roiByCategory(items, expenseMap = {}) {
  const map = {}
  for (const it of items) {
    if (it.status !== 'sold') continue
    const c = (map[it.category || 'other'] ||= { invested: 0, realized: 0, count: 0 })
    c.invested += it.buyPrice || 0
    c.realized += itemMath(it, expenseMap[it.id] || 0).realized
    c.count += 1
  }
  return Object.entries(map)
    .map(([id, v]) => ({ id, count: v.count, invested: Math.round(v.invested), realized: Math.round(v.realized), marginPct: v.invested ? Math.round((v.realized / v.invested) * 100) : 0 }))
    .sort((a, b) => b.realized - a.realized)
}

// Top flips and any losses, to learn from.
export function bestWorstFlips(items, expenseMap = {}) {
  const flips = items
    .filter((it) => it.status === 'sold')
    .map((it) => {
      const m = itemMath(it, expenseMap[it.id] || 0)
      return { id: it.id, title: it.title, realized: Math.round(m.realized), marginPct: Math.round(m.marginPct), holdDays: m.holdDays }
    })
    .sort((a, b) => b.realized - a.realized)
  return { best: flips.slice(0, 3), worst: flips.filter((f) => f.realized < 0).slice(-3).reverse() }
}

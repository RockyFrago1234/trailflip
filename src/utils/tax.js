// Bookkeeping / tax math for the LLC. Built on the same itemMath the rest of
// the app uses. Simplified cash-basis treatment: an item's cost (COGS) is
// counted in the year it SELLS, not the year it's bought — inventory you still
// hold isn't deductible yet. Not tax advice; verify rates with a pro.

import { itemMath, MILEAGE_RATE } from './format'

export const DEFAULT_SET_ASIDE = 0.25 // ~SE tax + a modest income bracket

export const quarterOf = (ms) => Math.floor(new Date(ms).getMonth() / 3) + 1 // 1..4

export function taxYears(items, expenses) {
  const years = new Set([new Date().getFullYear()])
  for (const it of items) if (it.soldAt) years.add(new Date(it.soldAt).getFullYear())
  for (const e of expenses) if (e.date) years.add(Number(e.date.slice(0, 4)))
  return [...years].sort((a, b) => b - a)
}

export function computeBooks(items, expenses, year, setAsideRate = DEFAULT_SET_ASIDE) {
  const sold = items.filter((it) => it.status === 'sold' && it.soldAt && new Date(it.soldAt).getFullYear() === year)
  const exp = expenses.filter((e) => e.date && Number(e.date.slice(0, 4)) === year)

  let receipts = 0, cogs = 0, fees = 0, shipping = 0, supplies = 0, mileageDeduction = 0
  const q = { 1: { receipts: 0, net: 0 }, 2: { receipts: 0, net: 0 }, 3: { receipts: 0, net: 0 }, 4: { receipts: 0, net: 0 } }

  for (const it of sold) {
    const m = itemMath(it)
    receipts += it.soldPrice || 0
    cogs += it.buyPrice || 0
    fees += it.fees || 0
    shipping += it.shippingCost || 0
    supplies += it.suppliesCost || 0
    mileageDeduction += m.mileageDeduction
    const n = quarterOf(it.soldAt)
    q[n].receipts += it.soldPrice || 0
    q[n].net += m.realized - m.mileageDeduction // item-level taxable net
  }

  const byCategory = {}
  let otherExpenses = 0
  for (const e of exp) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount
    otherExpenses += e.amount
    q[quarterOf(new Date(e.date).getTime())].net -= e.amount
  }

  const grossProfit = receipts - cogs
  const totalExpenses = fees + shipping + supplies + mileageDeduction + otherExpenses
  const netProfit = grossProfit - totalExpenses

  return {
    year,
    soldCount: sold.length,
    receipts: Math.round(receipts),
    cogs: Math.round(cogs),
    grossProfit: Math.round(grossProfit),
    fees: Math.round(fees),
    shipping: Math.round(shipping),
    supplies: Math.round(supplies),
    mileageDeduction: Math.round(mileageDeduction),
    mileageRate: MILEAGE_RATE,
    otherExpenses: Math.round(otherExpenses),
    byCategory,
    totalExpenses: Math.round(totalExpenses),
    netProfit: Math.round(netProfit),
    setAsideRate,
    setAside: Math.round(Math.max(0, netProfit) * setAsideRate),
    quarters: [1, 2, 3, 4].map((n) => ({
      q: n,
      receipts: Math.round(q[n].receipts),
      net: Math.round(q[n].net),
      setAside: Math.round(Math.max(0, q[n].net) * setAsideRate),
    })),
    soldItems: sold,
  }
}

function csvCell(v) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// A Schedule-C-style summary CSV for the year.
export function booksSummaryCSV(b) {
  const rows = [
    ['TrailFlip books summary', String(b.year)],
    [],
    ['Line', 'Amount (USD)'],
    ['Gross receipts (sales)', b.receipts],
    ['Cost of goods sold (items sold)', b.cogs],
    ['Gross profit', b.grossProfit],
    [],
    ['Expenses'],
    ['Commissions & platform fees', b.fees],
    ['Shipping & postage', b.shipping],
    ['Supplies (per item)', b.supplies],
    [`Vehicle / mileage (@ $${b.mileageRate}/mi)`, b.mileageDeduction],
    ['Other business expenses', b.otherExpenses],
    ['Total expenses', b.totalExpenses],
    [],
    ['Net profit', b.netProfit],
    [`Suggested tax set-aside (${Math.round(b.setAsideRate * 100)}%)`, b.setAside],
    ['Items sold', b.soldCount],
  ]
  return rows.map((r) => r.map(csvCell).join(',')).join('\n')
}

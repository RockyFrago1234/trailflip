import { useEffect, useMemo, useState } from 'react'
import { loadExpenses, createExpense, deleteExpense, EXPENSE_CATEGORIES, expenseLabel } from '../lib/expenses'
import { computeBooks, taxYears, booksSummaryCSV, DEFAULT_SET_ASIDE } from '../utils/tax'
import { monthlyProfit, roiByCategory, bestWorstFlips } from '../utils/insights'
import { currency, toCSV } from '../utils/format'
import { getCategory } from '../data/listings'

const todayStr = () => new Date().toISOString().slice(0, 10)

function download(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function Kpi({ label, value, tone, sub }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-lg font-extrabold ${tone === 'good' ? 'text-forest-700' : tone === 'bad' ? 'text-rose-600' : 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}

function Line({ label, value, strong, indent, negative }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${strong ? 'border-t border-slate-200 font-bold text-slate-900' : 'text-slate-600'} ${indent ? 'pl-4' : ''}`}>
      <span className="text-sm">{label}</span>
      <span className={`text-sm tabular-nums ${strong ? '' : 'font-medium'}`}>{negative && value !== '$0' ? `(${value})` : value}</span>
    </div>
  )
}

export default function Books({ items, userId }) {
  const [expenses, setExpenses] = useState([])
  const [available, setAvailable] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [rate, setRate] = useState(() => {
    const v = Number(localStorage.getItem('trailflip:setAsideRate'))
    return v > 0 && v < 1 ? v : DEFAULT_SET_ASIDE
  })
  const [form, setForm] = useState({ date: todayStr(), category: 'supplies', amount: '', note: '', itemId: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!userId) return
    let active = true
    loadExpenses(userId).then(({ expenses, available }) => {
      if (!active) return
      setExpenses(expenses)
      setAvailable(available)
    })
    return () => {
      active = false
    }
  }, [userId])

  useEffect(() => {
    localStorage.setItem('trailflip:setAsideRate', String(rate))
  }, [rate])

  const years = useMemo(() => taxYears(items, expenses), [items, expenses])
  const b = useMemo(() => computeBooks(items, expenses, year, rate), [items, expenses, year, rate])
  const itemsById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i.title])), [items])
  const itemExpenseMap = useMemo(() => {
    const m = {}
    for (const e of expenses) if (e.itemId) m[e.itemId] = (m[e.itemId] || 0) + e.amount
    return m
  }, [expenses])
  const monthly = useMemo(() => monthlyProfit(items, itemExpenseMap), [items, itemExpenseMap])
  const byCat = useMemo(() => roiByCategory(items, itemExpenseMap), [items, itemExpenseMap])
  const flips = useMemo(() => bestWorstFlips(items, itemExpenseMap), [items, itemExpenseMap])
  const maxMonth = Math.max(1, ...monthly.map((mo) => Math.abs(mo.total)))
  const maxCat = Math.max(1, ...byCat.map((c) => Math.abs(c.realized)))

  async function addExpense() {
    const amount = Number(form.amount)
    if (!amount || amount <= 0) return
    setError('')
    try {
      const e = await createExpense(userId, { date: form.date, category: form.category, amount, note: form.note, itemId: form.itemId || null })
      setExpenses((prev) => [e, ...prev])
      setForm({ date: todayStr(), category: form.category, amount: '', note: '', itemId: form.itemId })
    } catch (err) {
      setError(err.message || 'Could not save that expense.')
    }
  }
  async function removeExpense(id) {
    setExpenses((prev) => prev.filter((e) => e.id !== id))
    try {
      await deleteExpense(id)
    } catch {
      /* ignore */
    }
  }

  const expInYear = expenses.filter((e) => e.date && Number(e.date.slice(0, 4)) === year)

  return (
    <section className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">💰 Books &amp; taxes</h1>
          <p className="text-sm text-slate-500">Your flip business, tax-ready — income, cost of goods, expenses &amp; what to set aside.</p>
        </div>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* KPIs */}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Receipts" value={currency(b.receipts)} sub={`${b.soldCount} sold`} />
        <Kpi label="Cost of goods" value={currency(b.cogs)} />
        <Kpi label="Gross profit" value={currency(b.grossProfit)} />
        <Kpi label="Expenses" value={currency(b.totalExpenses)} />
        <Kpi label="Net profit" value={currency(b.netProfit)} tone={b.netProfit >= 0 ? 'good' : 'bad'} />
        <Kpi label={`Set aside ${Math.round(rate * 100)}%`} value={currency(b.setAside)} tone="bad" />
      </div>

      {byCat.length > 0 && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-bold text-slate-900">📈 Trends &amp; insights <span className="font-normal text-slate-400">(all-time)</span></p>

          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Net profit · last 12 months</p>
          <div className="mt-2 flex h-32 items-end gap-1">
            {monthly.map((mo, i) => {
              const pct = Math.round((Math.abs(mo.total) / maxMonth) * 100)
              return (
                <div key={i} className="flex h-full flex-1 flex-col justify-end" title={`${mo.label}: ${currency(mo.total)} · ${mo.count} sold`}>
                  <div className={`w-full rounded-t ${mo.total < 0 ? 'bg-rose-400' : 'bg-forest-500'}`} style={{ height: `${Math.max(pct, mo.total ? 4 : 0)}%` }} />
                </div>
              )
            })}
          </div>
          <div className="mt-1 flex gap-1">
            {monthly.map((mo, i) => <div key={i} className="flex-1 text-center text-[9px] text-slate-400">{mo.label[0]}</div>)}
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Profit by category</p>
              <div className="mt-2 space-y-1.5">
                {byCat.map((c) => {
                  const cat = getCategory(c.id)
                  const pct = Math.round((Math.abs(c.realized) / maxCat) * 100)
                  return (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <span className="w-24 shrink-0 truncate text-slate-600">{cat.emoji} {cat.label}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full ${c.realized < 0 ? 'bg-rose-400' : 'bg-forest-500'}`} style={{ width: `${Math.max(pct, 3)}%` }} />
                      </div>
                      <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-slate-900">{currency(c.realized)} <span className="font-normal text-slate-400">{c.marginPct}%</span></span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Best flips</p>
              <div className="mt-2 space-y-1">
                {flips.best.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-slate-700">{f.title}</span>
                    <span className="shrink-0 font-semibold text-forest-700">+{currency(f.realized)}{f.holdDays != null ? ` · ${f.holdDays}d` : ''}</span>
                  </div>
                ))}
              </div>
              {flips.worst.length > 0 && (
                <>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Losses</p>
                  <div className="mt-2 space-y-1">
                    {flips.worst.map((f) => (
                      <div key={f.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate text-slate-700">{f.title}</span>
                        <span className="shrink-0 font-semibold text-rose-600">{currency(f.realized)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* Schedule C breakdown */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-900">{year} summary <span className="font-normal text-slate-400">(Schedule C style)</span></p>
            <button onClick={() => download(`trailflip-${year}-summary.csv`, booksSummaryCSV(b))} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200">⬇ Summary</button>
          </div>
          <div className="mt-2">
            <Line label="Gross receipts (sales)" value={currency(b.receipts)} />
            <Line label="Cost of goods sold" value={currency(b.cogs)} negative />
            <Line label="Gross profit" value={currency(b.grossProfit)} strong />
            <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Expenses</div>
            <Line label="Commissions & fees" value={currency(b.fees)} indent negative />
            <Line label="Shipping & postage" value={currency(b.shipping)} indent negative />
            <Line label="Supplies (per item)" value={currency(b.supplies)} indent negative />
            <Line label={`Vehicle / mileage @ $${b.mileageRate}/mi`} value={currency(b.mileageDeduction)} indent negative />
            {EXPENSE_CATEGORIES.filter((c) => b.byCategory[c.id]).map((c) => (
              <Line key={c.id} label={c.label} value={currency(b.byCategory[c.id])} indent negative />
            ))}
            <Line label="Net profit (taxable)" value={currency(b.netProfit)} strong />
            <Line label={`Suggested set-aside (${Math.round(rate * 100)}%)`} value={currency(b.setAside)} />
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-500">Set-aside rate</span>
            <input type="number" min="0" max="60" value={Math.round(rate * 100)} onChange={(e) => setRate(Math.min(60, Math.max(0, Number(e.target.value))) / 100)} className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm" />
            <span className="text-xs text-slate-500">%</span>
            <button onClick={() => download(`trailflip-${year}-transactions.csv`, toCSV(b.soldItems))} className="ml-auto rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200">⬇ Transactions</button>
          </div>
        </div>

        {/* Quarterly */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-bold text-slate-900">Quarterly (estimated taxes)</p>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-1 font-semibold">Quarter</th>
                <th className="py-1 text-right font-semibold">Receipts</th>
                <th className="py-1 text-right font-semibold">Net</th>
                <th className="py-1 text-right font-semibold">Set aside</th>
              </tr>
            </thead>
            <tbody>
              {b.quarters.map((qq) => (
                <tr key={qq.q} className="border-t border-slate-50">
                  <td className="py-1.5 font-medium text-slate-700">Q{qq.q}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600">{currency(qq.receipts)}</td>
                  <td className={`py-1.5 text-right tabular-nums font-semibold ${qq.net >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>{currency(qq.net)}</td>
                  <td className="py-1.5 text-right tabular-nums font-bold text-forest-700">{currency(qq.setAside)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-slate-400">
            Estimated quarterly taxes are typically due Apr 15, Jun 15, Sep 15 &amp; Jan 15. The set-aside is a rough cushion — confirm with a tax pro.
          </p>
        </div>
      </div>

      {/* Expenses ledger */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-900">Business expenses</p>
          {expInYear.length > 0 && (
            <button
              onClick={() => download(`trailflip-${year}-expenses.csv`, ['Date,Category,Amount,Note', ...expInYear.map((e) => `${e.date},${expenseLabel(e.category)},${e.amount},"${(e.note || '').replace(/"/g, '""')}"`)].join('\n'))}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
            >⬇ Expenses</button>
          )}
        </div>

        {!available ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">One setup step to log expenses</p>
            <p className="mt-1 text-amber-800">The expenses table isn’t in the database yet. Run <span className="font-mono text-xs">npx supabase db push</span> to enable saving business expenses. (Your sales, COGS &amp; mileage above already work.)</p>
          </div>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-sm" />
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-sm">
                {EXPENSE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} className="max-w-[12rem] rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-sm" title="Link this expense to a product (optional)">
                <option value="">(no item)</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
              </select>
              <input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="$" className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-sm" />
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="note (optional)" className="min-w-[8rem] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-sm" />
              <button onClick={addExpense} disabled={!Number(form.amount)} className="rounded-full bg-forest-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest-700 disabled:opacity-40">Add</button>
            </div>
            {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
            {expInYear.length === 0 ? (
              <p className="mt-3 text-xs text-slate-400">No {year} expenses logged yet. Add store fees, supplies, gas, software, etc.</p>
            ) : (
              <div className="mt-3 divide-y divide-slate-50">
                {expInYear.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className="w-20 shrink-0 text-xs text-slate-400">{e.date}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{expenseLabel(e.category)}</span>
                    {e.itemId && itemsById[e.itemId] && (
                      <span className="max-w-[10rem] truncate rounded-full bg-forest-50 px-2 py-0.5 text-[11px] font-medium text-forest-700">🔗 {itemsById[e.itemId]}</span>
                    )}
                    <span className="truncate text-slate-600">{e.note}</span>
                    <span className="ml-auto font-semibold tabular-nums text-slate-900">{currency(e.amount)}</span>
                    <button onClick={() => removeExpense(e.id)} className="rounded-full px-1.5 text-slate-400 transition hover:text-rose-500" aria-label="Delete">×</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <p className="mt-4 text-center text-[11px] text-slate-400">
        TrailFlip Books is a bookkeeping aid, not tax advice. COGS is counted when an item sells (cash-basis). Verify mileage rates &amp; set-aside % with a tax professional.
      </p>
    </section>
  )
}

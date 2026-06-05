import { currency } from '../utils/format'

const clamp = (s) => Math.max(0, Math.min(100, Number(s) || 0))

function scoreColor(s) {
  if (s >= 70) return 'bg-forest-600'
  if (s >= 45) return 'bg-trail-500'
  return 'bg-rose-500'
}

function Row({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  )
}

function Bullets({ title, items }) {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
        {items.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </div>
  )
}

// Renders a saved or fresh evaluation (the tool output from /api/evaluate).
export default function EvaluationReport({ result: r, showHeader = true }) {
  if (!r) return null
  const score = clamp(r.deal_score)
  const title = [r.brand, r.model].filter(Boolean).join(' ') || 'Unidentified gear'
  const hasUsed = r.used_low_usd != null || r.used_high_usd != null
  const subtitle = [r.category, r.year, r.confidence ? `${r.confidence} confidence` : null].filter(Boolean).join(' · ')

  return (
    <div className="grid gap-4">
      {showHeader && (
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">{title}</h3>
              {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
            </div>
            <div className="shrink-0 text-center">
              <div className={`grid h-14 w-14 place-items-center rounded-2xl text-xl font-extrabold text-white ${scoreColor(score)}`}>
                {score}
              </div>
              <p className="mt-1 text-[11px] font-medium text-slate-500">flip score</p>
            </div>
          </div>
          {r.verdict && (
            <p className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{r.verdict}</p>
          )}
          {r.summary && <p className="mt-3 text-sm leading-relaxed text-slate-700">{r.summary}</p>}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 p-4">
        <Row label="MSRP (new)" value={r.msrp_usd != null ? currency(r.msrp_usd) : null} />
        <Row label="Typical used value" value={hasUsed ? `${currency(r.used_low_usd)} – ${currency(r.used_high_usd)}` : null} />
        <Row label="Listed price" value={r.listed_price_usd != null ? currency(r.listed_price_usd) : null} />
        <Row label="Est. profit potential" value={r.estimated_profit_usd != null ? `+${currency(r.estimated_profit_usd)}` : null} />
      </div>

      {Array.isArray(r.ratings) && r.ratings.length > 0 && (
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">⭐ Ratings</p>
          <div className="mt-3 space-y-3">
            {r.ratings.map((rt, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{rt.label}</span>
                  <span className="font-bold text-slate-900">{clamp(rt.score)}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full ${scoreColor(clamp(rt.score))}`} style={{ width: `${clamp(rt.score)}%` }} />
                </div>
                {rt.note && <p className="mt-1 text-xs text-slate-500">{rt.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <Bullets title="📋 Details" items={r.key_details} />
      <Bullets title="🔧 Common issues to check" items={r.common_issues} />
      <Bullets title="🔍 Before you buy" items={r.inspection_tips} />

      {r.manufacturer_url && (
        <a
          href={r.manufacturer_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          View on manufacturer&apos;s site ↗
        </a>
      )}
    </div>
  )
}

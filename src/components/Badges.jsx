// Small, reusable status pills used on cards and in the detail view.

const TYPE_META = {
  sale: { label: 'For sale', cls: 'bg-forest-100 text-forest-800' },
  trade: { label: 'Trade only', cls: 'bg-blue-100 text-blue-800' },
  both: { label: 'Sale or trade', cls: 'bg-trail-500/15 text-trail-600' },
}

export function TypeBadge({ type }) {
  const meta = TYPE_META[type] || TYPE_META.sale
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.cls}`}>
      {meta.label}
    </span>
  )
}

export function ConditionPill({ condition }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      {condition}
    </span>
  )
}

export function DealBadge({ info, className = '' }) {
  if (info.tier === 'hot') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-trail-500 px-2 py-0.5 text-xs font-bold text-white shadow-sm ${className}`}
      >
        🔥 Flip {info.score}
      </span>
    )
  }
  if (info.tier === 'good') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-forest-600 px-2 py-0.5 text-xs font-bold text-white ${className}`}
      >
        Good deal
      </span>
    )
  }
  return null
}

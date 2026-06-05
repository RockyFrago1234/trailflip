import { CONDITIONS } from '../data/listings'

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none transition focus:border-forest-400 focus:ring-2 focus:ring-forest-100"
    >
      {options.map(([val, label]) => (
        <option key={val} value={val}>
          {label}
        </option>
      ))}
    </select>
  )
}

function toggleCls(active, color) {
  const on = color === 'trail' ? 'bg-trail-500 text-white' : 'bg-rose-500 text-white'
  return `rounded-full px-3 py-1.5 text-sm font-medium transition ${
    active ? on : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
  }`
}

export default function FilterBar({
  categories,
  category,
  onCategory,
  type,
  onType,
  condition,
  onCondition,
  sort,
  onSort,
  onlyDeals,
  onToggleDeals,
  onlySaved,
  onToggleSaved,
  savedCount,
  count,
}) {
  const chip = (active) =>
    `whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
      active
        ? 'bg-forest-600 text-white shadow-sm'
        : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
    }`

  return (
    <div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <button className={chip(category === 'all')} onClick={() => onCategory('all')}>
          All gear
        </button>
        {categories.map((c) => (
          <button key={c.id} className={chip(category === c.id)} onClick={() => onCategory(c.id)}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">
            <b className="text-slate-900">{count}</b> {count === 1 ? 'listing' : 'listings'}
          </span>
          <span className="hidden h-4 w-px bg-slate-200 sm:block" />
          <button onClick={onToggleDeals} className={toggleCls(onlyDeals, 'trail')}>
            🔥 Hot flips
          </button>
          <button onClick={onToggleSaved} className={toggleCls(onlySaved, 'rose')}>
            ♥ Saved{savedCount ? ` (${savedCount})` : ''}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={type}
            onChange={onType}
            options={[
              ['all', 'All types'],
              ['sale', 'For sale'],
              ['trade', 'Open to trade'],
            ]}
          />
          <Select
            value={condition}
            onChange={onCondition}
            options={[['all', 'Any condition'], ...CONDITIONS.map((c) => [c, c])]}
          />
          <Select
            value={sort}
            onChange={onSort}
            options={[
              ['deal', 'Best deals'],
              ['new', 'Newest'],
              ['price-asc', 'Price: low → high'],
              ['price-desc', 'Price: high → low'],
            ]}
          />
        </div>
      </div>
    </div>
  )
}

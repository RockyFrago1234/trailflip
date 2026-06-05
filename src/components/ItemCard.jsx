import ImagePlaceholder from './ImagePlaceholder'
import { getCategory } from '../data/listings'
import { STATUS_META } from '../lib/items'
import { currency, itemMath } from '../utils/format'

function MoneyLine({ item }) {
  const m = itemMath(item)
  if (item.status === 'sold') {
    return (
      <>
        <span className="text-xl font-extrabold text-slate-900">{currency(item.soldPrice)}</span>
        {item.buyPrice != null && (
          <p className={`text-xs font-medium ${m.realized >= 0 ? 'text-forest-700' : 'text-rose-600'}`}>
            paid {currency(item.buyPrice)} · {m.realized >= 0 ? '+' : ''}{currency(m.realized)}
          </p>
        )}
      </>
    )
  }
  if (item.status === 'listed') {
    return (
      <>
        <span className="text-xl font-extrabold text-slate-900">{currency(item.listPrice ?? m.mid)}</span>
        {item.buyPrice != null && m.projected !== 0 && (
          <p className="text-xs font-medium text-forest-700">paid {currency(item.buyPrice)} · +{currency(m.projected)} est</p>
        )}
      </>
    )
  }
  if (item.status === 'owned') {
    return (
      <>
        <span className="text-xl font-extrabold text-slate-900">{currency(item.buyPrice)}</span>
        <p className="text-xs text-slate-500">paid · ≈ {currency(m.mid)} resale</p>
      </>
    )
  }
  // wishlist / prospect
  return (
    <>
      <span className="text-xl font-extrabold text-slate-900">
        {item.askingPrice != null ? currency(item.askingPrice) : '≈ ' + currency(m.mid)}
      </span>
      {item.askingPrice != null && m.spread > 0 && (
        <p className="text-xs font-medium text-forest-700">≈ {currency(m.mid)} resale · +{currency(m.spread)}</p>
      )}
    </>
  )
}

export default function ItemCard({ item, onOpen }) {
  const cat = getCategory(item.category)
  const cover = item.photos[0] || item.officialPhotos[0] || null
  const meta = STATUS_META[item.status] || STATUS_META.prospect

  return (
    <article
      onClick={() => onOpen(item)}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative">
        {cover ? (
          <img src={cover} alt={item.title} className="h-44 w-full bg-slate-100 object-cover" loading="lazy" />
        ) : (
          <ImagePlaceholder from={cat.from} to={cat.to} emoji={cat.emoji} className="h-44 w-full" />
        )}

        <span className={`absolute left-3 top-3 rounded-full px-2 py-0.5 text-xs font-bold ${meta.pill}`}>
          {meta.emoji} {meta.label}
        </span>

        {item.flipScore != null && (
          <span className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-slate-900/85 text-sm font-extrabold text-white backdrop-blur">
            {item.flipScore}
          </span>
        )}

        <span className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
          {cat.emoji} {cat.label}
        </span>
      </div>

      <div className="p-4">
        <h3 className="line-clamp-1 font-semibold text-slate-900">{item.title}</h3>
        <div className="mt-1.5">
          <MoneyLine item={item} />
        </div>
        {item.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

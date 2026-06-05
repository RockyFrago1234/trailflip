import ImagePlaceholder from './ImagePlaceholder'
import { TypeBadge, ConditionPill, DealBadge } from './Badges'
import { Heart, Pin } from './icons'
import { getCategory } from '../data/listings'
import { currency, timeAgo, dealInfo } from '../utils/format'

export default function ListingCard({ listing, saved, onToggleSave, onOpen }) {
  const cat = getCategory(listing.category)
  const info = dealInfo(listing)
  const tradeOnly = listing.type === 'trade'

  return (
    <article
      onClick={() => onOpen(listing)}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative">
        <ImagePlaceholder from={cat.from} to={cat.to} emoji={listing.emoji} className="h-44 w-full" />

        <div className="absolute left-3 top-3 flex gap-2">
          <DealBadge info={info} />
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleSave(listing.id)
          }}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-slate-700 shadow-sm backdrop-blur transition hover:bg-white"
          aria-label={saved ? 'Remove from saved' : 'Save listing'}
        >
          <Heart filled={saved} />
        </button>

        <span className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
          {cat.emoji} {cat.label}
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <TypeBadge type={listing.type} />
          <ConditionPill condition={listing.condition} />
        </div>

        <h3 className="mt-2 line-clamp-1 font-semibold text-slate-900">{listing.title}</h3>

        <div className="mt-2">
          {tradeOnly ? (
            <>
              <span className="text-lg font-extrabold text-blue-700">Trade only</span>
              {listing.estResale ? (
                <p className="text-xs text-slate-500">Worth ≈ {currency(listing.estResale)}</p>
              ) : null}
            </>
          ) : (
            <>
              <span className="text-xl font-extrabold text-slate-900">{currency(listing.price)}</span>
              {info.profit > 0 && (
                <p className="text-xs font-medium text-forest-700">
                  ≈ {currency(listing.estResale)} resale · +{currency(info.profit)}
                </p>
              )}
            </>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Pin /> {listing.location}
          </span>
          <span>{timeAgo(listing.postedAt)}</span>
        </div>
      </div>
    </article>
  )
}

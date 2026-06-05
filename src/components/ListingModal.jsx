import { useEffect, useState } from 'react'
import ImagePlaceholder from './ImagePlaceholder'
import { TypeBadge, ConditionPill, DealBadge } from './Badges'
import { Heart, Pin, Close } from './icons'
import { getCategory } from '../data/listings'
import { currency, timeAgo, dealInfo } from '../utils/format'

function Stat({ label, value, highlight }) {
  return (
    <div className="rounded-xl bg-white p-2 ring-1 ring-slate-100">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-sm font-bold ${highlight ? 'text-forest-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

function initials(name = '') {
  const parts = name.split(' ').filter(Boolean)
  return parts.map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '🙂'
}

export default function ListingModal({ listing, saved, onToggleSave, onClose }) {
  const [note, setNote] = useState('')

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const cat = getCategory(listing.category)
  const info = dealInfo(listing)
  const tradeOnly = listing.type === 'trade'

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="animate-pop-in relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-slate-700 shadow transition hover:bg-white"
          aria-label="Close"
        >
          <Close />
        </button>

        <ImagePlaceholder
          from={cat.from}
          to={cat.to}
          emoji={listing.emoji}
          className="h-56 w-full rounded-t-3xl sm:h-64"
          emojiClass="text-8xl"
        />

        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={listing.type} />
            <DealBadge info={info} />
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {cat.emoji} {cat.label}
            </span>
            <span className="ml-auto">
              <ConditionPill condition={listing.condition} />
            </span>
          </div>

          <h2 className="mt-3 text-2xl font-extrabold text-slate-900">{listing.title}</h2>

          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Pin /> {listing.location}
            </span>
            <span>· {timeAgo(listing.postedAt)}</span>
          </div>

          <div className="mt-4 flex items-end gap-3">
            {tradeOnly ? (
              <span className="text-2xl font-extrabold text-blue-700">Trade only</span>
            ) : (
              <span className="text-3xl font-extrabold text-slate-900">{currency(listing.price)}</span>
            )}
            {listing.estResale && (
              <span className="pb-1 text-sm text-slate-500">market ≈ {currency(listing.estResale)}</span>
            )}
          </div>

          {info.tier !== 'none' && !tradeOnly && (
            <div className="mt-4 rounded-2xl border border-trail-500/30 bg-trail-500/5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-trail-600">🔥 Flip potential</span>
                <span className="rounded-full bg-trail-500 px-2 py-0.5 text-xs font-bold text-white">
                  Score {info.score}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Buy" value={currency(listing.price)} />
                <Stat label="Est. resale" value={currency(listing.estResale)} />
                <Stat label="Profit" value={`+${currency(info.profit)}`} highlight />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Estimated from comparable sales. Always inspect before buying to flip.
              </p>
            </div>
          )}

          {listing.tradeFor && (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <b>Looking to trade for:</b> {listing.tradeFor}
            </div>
          )}

          <p className="mt-4 whitespace-pre-line leading-relaxed text-slate-700">{listing.description}</p>

          <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-forest-100 font-bold text-forest-700">
              {initials(listing.seller)}
            </div>
            <div className="text-sm">
              <p className="font-semibold text-slate-900">{listing.seller}</p>
              <p className="text-slate-500">
                ⭐ {(listing.rating ?? 5).toFixed(1)} · usually replies fast
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() =>
                setNote(
                  tradeOnly
                    ? `Trade proposal sent to ${listing.seller}. They’ll reply right here in TrailFlip.`
                    : `We let ${listing.seller} know you’re interested — watch for a reply in your inbox.`,
                )
              }
              className="flex-1 rounded-full bg-forest-600 px-4 py-3 font-semibold text-white transition hover:bg-forest-700"
            >
              {tradeOnly ? 'Propose a trade' : 'Message seller'}
            </button>
            {!tradeOnly && (
              <button
                onClick={() => setNote(`Offer sent to ${listing.seller}. You’ll get a notification if they accept.`)}
                className="flex-1 rounded-full bg-trail-500 px-4 py-3 font-semibold text-white transition hover:bg-trail-600"
              >
                Make an offer
              </button>
            )}
            <button
              onClick={() => onToggleSave(listing.id)}
              className={`grid place-items-center rounded-full px-4 py-3 transition ${
                saved
                  ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              aria-label={saved ? 'Remove from saved' : 'Save listing'}
            >
              <Heart filled={saved} />
            </button>
          </div>

          {note && (
            <p className="mt-3 rounded-xl bg-forest-50 px-3 py-2 text-sm font-medium text-forest-800">
              {note}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

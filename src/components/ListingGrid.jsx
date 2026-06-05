import ListingCard from './ListingCard'

export default function ListingGrid({ listings, savedSet, onToggleSave, onOpen, onReset }) {
  if (!listings.length) {
    return (
      <div className="mt-10 grid place-items-center rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center">
        <div className="text-5xl">🧭</div>
        <h3 className="mt-3 text-lg font-semibold text-slate-800">No gear matches your filters</h3>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          Try widening your search or clearing a filter — new deals get posted all the time.
        </p>
        <button
          onClick={onReset}
          className="mt-4 rounded-full bg-forest-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest-700"
        >
          Reset filters
        </button>
      </div>
    )
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {listings.map((listing) => (
        <ListingCard
          key={listing.id}
          listing={listing}
          saved={savedSet.has(listing.id)}
          onToggleSave={onToggleSave}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}

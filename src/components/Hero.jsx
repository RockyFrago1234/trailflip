import { currency } from '../utils/format'

function HeroStat({ value, label }) {
  return (
    <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
      <p className="text-2xl font-extrabold sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-forest-50/80 sm:text-sm">{label}</p>
    </div>
  )
}

export default function Hero({ stats, onPost, onBrowse }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-forest-800 via-forest-700 to-forest-600 text-white">
      <div className="pointer-events-none absolute inset-0 select-none opacity-20">
        <span className="absolute left-[8%] top-10 text-7xl">🏔️</span>
        <span className="absolute right-[10%] top-16 text-6xl">🚵</span>
        <span className="absolute bottom-8 left-[22%] text-6xl">⛺</span>
        <span className="absolute bottom-12 right-[16%] text-7xl">🎿</span>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:py-24">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium ring-1 ring-white/20">
          Buy · Sell · Trade outdoor gear
        </span>

        <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.1] sm:text-6xl">
          Find the deal. Flip the gear.{' '}
          <span className="text-trail-400">Fund the adventure.</span>
        </h1>

        <p className="mt-5 max-w-xl text-lg text-forest-50/90">
          {
            "Score underpriced bikes, tents, skis and more — then sell or trade with people who actually know what it's worth. Every listing shows its flip potential."
          }
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={onPost}
            className="rounded-full bg-trail-500 px-6 py-3 font-semibold shadow-lg shadow-trail-500/30 transition hover:bg-trail-600"
          >
            List your gear
          </button>
          <button
            onClick={onBrowse}
            className="rounded-full bg-white/10 px-6 py-3 font-semibold ring-1 ring-white/30 transition hover:bg-white/20"
          >
            Browse deals →
          </button>
        </div>

        <div className="mt-12 grid max-w-2xl grid-cols-3 gap-3 sm:gap-4">
          <HeroStat value={stats.listings} label="Listings live" />
          <HeroStat value={stats.deals} label="Hot flips 🔥" />
          <HeroStat value={currency(stats.profit)} label="Profit on the table" />
        </div>
      </div>
    </section>
  )
}

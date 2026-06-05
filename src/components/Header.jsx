import { Logo, Search, Heart } from './icons'

export default function Header({ query, onQuery, savedCount, onOpenSaved, onPost, onHome }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:gap-4">
        <button onClick={onHome} className="flex shrink-0 items-center gap-2" aria-label="TrailFlip home">
          <Logo />
          <span className="hidden text-lg font-extrabold tracking-tight text-slate-900 sm:block">
            Trail<span className="text-forest-600">Flip</span>
          </span>
        </button>

        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <Search />
          </span>
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search gear — bikes, tents, skis…"
            className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm outline-none transition focus:border-forest-400 focus:bg-white focus:ring-2 focus:ring-forest-100"
          />
        </div>

        <button
          onClick={onOpenSaved}
          className="relative hidden shrink-0 rounded-full p-2 text-slate-600 transition hover:bg-slate-100 sm:block"
          title="Saved gear"
          aria-label="Saved gear"
        >
          <Heart filled={savedCount > 0} />
          {savedCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {savedCount}
            </span>
          )}
        </button>

        <button
          onClick={onPost}
          className="shrink-0 rounded-full bg-forest-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-forest-700"
        >
          <span className="sm:hidden">+ Post</span>
          <span className="hidden sm:inline">+ Post listing</span>
        </button>
      </div>
    </header>
  )
}

import { useState } from 'react'
import { Logo, Search, Heart } from './icons'
import { useAuth } from '../context/AuthProvider'

function initials(name = '') {
  const parts = name.split(' ').filter(Boolean)
  return (parts.map((p) => p[0]).slice(0, 2).join('') || name[0] || 'U').toUpperCase()
}

export default function Header({ query, onQuery, savedCount, onOpenSaved, onPost, onHome, onLogin }) {
  const { user, displayName, signOut } = useAuth()
  const [menu, setMenu] = useState(false)

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

        {user ? (
          <div className="relative shrink-0">
            <button
              onClick={() => setMenu((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-full bg-forest-100 text-sm font-bold text-forest-700 ring-1 ring-forest-200 transition hover:bg-forest-200"
              aria-label="Account menu"
            >
              {initials(displayName)}
            </button>
            {menu && (
              <>
                <button
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setMenu(false)}
                  aria-hidden="true"
                  tabIndex={-1}
                />
                <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  <div className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
                    Signed in as
                    <div className="truncate font-semibold text-slate-800">{displayName}</div>
                  </div>
                  <button
                    onClick={() => {
                      setMenu(false)
                      onOpenSaved()
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                  >
                    ♥ My favorites
                  </button>
                  <button
                    onClick={async () => {
                      setMenu(false)
                      await signOut()
                    }}
                    className="block w-full px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                  >
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={onLogin}
            className="hidden shrink-0 rounded-full px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 sm:block"
          >
            Log in
          </button>
        )}
      </div>
    </header>
  )
}

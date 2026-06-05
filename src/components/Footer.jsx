import { Logo } from './icons'

function Column({ title, links }) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-slate-500">
        {links.map((l) => (
          <li key={l}>
            <a href="#browse" className="transition hover:text-forest-600">
              {l}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Footer({ onPost }) {
  return (
    <footer className="mt-12 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <Logo className="h-7 w-7" />
              <span className="text-lg font-extrabold text-slate-900">
                Trail<span className="text-forest-600">Flip</span>
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-slate-500">
              The marketplace for outdoor people who love a good deal. Buy it, use it, flip it.
            </p>
            <button
              onClick={onPost}
              className="mt-4 rounded-full bg-forest-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest-700"
            >
              Post a listing
            </button>
          </div>

          <Column title="Marketplace" links={['Browse gear', 'Hot flips', 'Trades', 'Saved items']} />
          <Column title="Company" links={['About', 'How it works', 'Trust & safety', 'Careers']} />
          <Column title="Help" links={['Buying guide', 'Selling tips', 'Shipping', 'Contact']} />
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-slate-100 pt-6 text-sm text-slate-400 sm:flex-row">
          <p>© {new Date().getFullYear()} TrailFlip. Built for the trade.</p>
          <p>Made with React + Tailwind</p>
        </div>
      </div>
    </footer>
  )
}

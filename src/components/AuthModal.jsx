import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthProvider'
import { Close, Logo } from './icons'

export default function AuthModal({ onClose, reason }) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

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

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (password.length < 6) {
      setErr('Password must be at least 6 characters.')
      return
    }
    setBusy(true)
    const error = mode === 'signup' ? await signUp(email, password, name) : await signIn(email, password)
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    onClose()
  }

  const field =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-forest-400 focus:bg-white focus:ring-2 focus:ring-forest-100'

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        className="animate-pop-in w-full max-w-md overflow-hidden rounded-t-3xl bg-white sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="text-lg font-extrabold">
              Trail<span className="text-forest-600">Flip</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100"
            aria-label="Close"
          >
            <Close />
          </button>
        </div>

        <div className="px-5 py-5">
          <h2 className="text-xl font-extrabold text-slate-900">
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {reason ||
              (mode === 'signup'
                ? 'Join the marketplace to post, save and trade.'
                : 'Log in to your TrailFlip account.')}
          </p>

          <div className="mt-4 grid gap-3">
            {mode === 'signup' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Display name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex F." className={field} />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className={field}
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className={field}
              />
            </div>
          </div>

          {err && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full rounded-full bg-forest-600 px-4 py-3 font-semibold text-white transition hover:bg-forest-700 disabled:opacity-50"
          >
            {busy ? 'One sec…' : mode === 'signup' ? 'Create account' : 'Log in'}
          </button>

          <p className="mt-4 text-center text-sm text-slate-500">
            {mode === 'signup' ? 'Already have an account?' : 'New to TrailFlip?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signup' ? 'login' : 'signup')
                setErr('')
              }}
              className="font-semibold text-forest-600 hover:underline"
            >
              {mode === 'signup' ? 'Log in' : 'Create one'}
            </button>
          </p>
        </div>
      </form>
    </div>
  )
}

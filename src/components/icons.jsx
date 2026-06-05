// Lightweight inline SVG icons so the app stays dependency-free and crisp.

export function Logo({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#15803d" />
      <path d="M10 47 L26 21 L35 35 L41 27 L54 47 Z" fill="#ffffff" />
      <path d="M26 21 L31.5 30 L20.5 30 Z" fill="#bbf7d0" />
      <circle cx="46" cy="20" r="5" fill="#f97316" />
    </svg>
  )
}

export function Heart({ filled, className = 'h-5 w-5' }) {
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="#f43f5e" aria-hidden="true">
        <path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2 4.8 5.6 4.2 8 3.8 10 5 12 7c2-2 4-3.2 6.4-2.8C22 4.8 23.6 8.4 22 11.7 19.5 16.4 12 21 12 21z" />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19.5 12.6 12 20l-7.5-7.4a4.5 4.5 0 1 1 6.4-6.3l1.1 1.1 1.1-1.1a4.5 4.5 0 1 1 6.4 6.3z" />
    </svg>
  )
}

export function Pin({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

export function Search({ className = 'h-5 w-5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

export function Close({ className = 'h-5 w-5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

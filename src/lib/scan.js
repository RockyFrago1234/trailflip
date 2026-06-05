// Client wrapper around /api/scan (the marketplace deal scanner).

// Marketplaces in "easiest / least-permission first" order. `ready: false`
// sources are scaffolded but need a key or further work before they appear.
export const SCAN_SOURCES = [
  { id: 'ebay', label: 'eBay', emoji: '🛒', ready: true },
]

export async function scanMarketplace({ source = 'ebay', query, maxPrice = null, sort = 'newest' }) {
  const resp = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, query, maxPrice, sort }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(data.error || `Scan failed (${resp.status})`)
  return data // { source, configured, listings, total, query, maxPrice }
}

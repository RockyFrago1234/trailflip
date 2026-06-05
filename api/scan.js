// Marketplace deal scanner — pulls live listings for a saved "deal hunt".
//
// Provider-agnostic by design. The FIRST real source is eBay's official Browse
// API: it's sanctioned ("fair game"), reliable, and uses the lowest-permission
// auth (a client-credentials *application* token — no user login). The zero-key
// alternatives a flipper might expect (Craigslist RSS, Reddit JSON) hard-block
// server requests with a 403, which is exactly why HTML scraping was off the
// table — so we go through the front door eBay opens for us.
//
// Add more providers behind the same `{ configured, listings }` shape and they
// light up in the UI automatically.

export const config = { maxDuration: 30 }

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

// --- eBay Browse API ---------------------------------------------------------

const EBAY_OAUTH = 'https://api.ebay.com/identity/v1/oauth2/token'
const EBAY_SEARCH = 'https://api.ebay.com/buy/browse/v1/item_summary/search'
const EBAY_INSIGHTS = 'https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search'
const EBAY_SCOPE = 'https://api.ebay.com/oauth/api_scope'

// Application token, cached across warm invocations (valid ~2h).
let tokenCache = null
async function ebayToken() {
  const id = process.env.EBAY_APP_ID
  const secret = process.env.EBAY_CERT_ID
  if (!id || !secret) return null
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token

  const basic = Buffer.from(`${id}:${secret}`).toString('base64')
  const resp = await fetch(EBAY_OAUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(EBAY_SCOPE)}`,
  })
  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    throw new Error(`eBay auth failed (${resp.status}). ${t.slice(0, 200)}`)
  }
  const j = await resp.json()
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 7200) * 1000 }
  return tokenCache.token
}

// eBay's free-text condition -> our 4-bucket scale.
function mapCondition(c = '') {
  const s = c.toLowerCase()
  if (s.includes('new') && !s.includes('open')) return 'New'
  if (s.includes('open box') || s.includes('like new') || s.includes('refurb')) return 'Like New'
  if (s.includes('parts') || s.includes('not working') || s.includes('poor')) return 'Fair'
  return 'Good'
}

async function scanEbay({ q, maxPrice, sort = 'newlyListed', limit = 24 }) {
  const token = await ebayToken()
  if (!token) return { configured: false, listings: [] }

  const params = new URLSearchParams({ q, limit: String(limit) })
  if (sort === 'price') params.set('sort', 'price')
  else if (sort === 'newest') params.set('sort', 'newlyListed')
  const filters = []
  if (maxPrice) filters.push(`price:[..${Math.round(maxPrice)}],priceCurrency:USD`)
  if (filters.length) params.set('filter', filters.join(','))

  const resp = await fetch(`${EBAY_SEARCH}?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': process.env.EBAY_MARKETPLACE || 'EBAY_US',
      'Content-Type': 'application/json',
    },
  })
  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    throw new Error(`eBay search failed (${resp.status}). ${t.slice(0, 200)}`)
  }
  const j = await resp.json()
  const listings = (j.itemSummaries || []).map((it) => ({
    id: it.itemId,
    title: it.title,
    price: it.price ? Number(it.price.value) : null,
    currency: it.price?.currency || 'USD',
    url: it.itemWebUrl,
    image: it.image?.imageUrl || it.thumbnailImages?.[0]?.imageUrl || null,
    condition: it.condition || null,
    conditionBucket: mapCondition(it.condition || ''),
    where: it.itemLocation
      ? [it.itemLocation.city, it.itemLocation.stateOrProvince, it.itemLocation.country]
          .filter(Boolean)
          .join(', ')
      : null,
    auction: (it.buyingOptions || []).includes('AUCTION'),
    source: 'ebay',
  }))
  return { configured: true, listings, total: j.total ?? listings.length }
}

// eBay Marketplace Insights — recent SOLD prices + sell-through. Same app token,
// but the keyset must be granted Marketplace Insights access (apply in the eBay
// developer portal); until then eBay returns 403 and we surface a hint.
async function scanEbaySold({ q, maxPrice, limit = 24 }) {
  const token = await ebayToken()
  if (!token) return { configured: false, listings: [] }

  const params = new URLSearchParams({ q, limit: String(limit) })
  if (maxPrice) params.set('filter', `price:[..${Math.round(maxPrice)}],priceCurrency:USD`)

  const resp = await fetch(`${EBAY_INSIGHTS}?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': process.env.EBAY_MARKETPLACE || 'EBAY_US',
      'Content-Type': 'application/json',
    },
  })
  if (resp.status === 403) {
    return { configured: true, listings: [], note: "Your eBay app isn't approved for the Marketplace Insights API yet — apply for it in the eBay developer portal to unlock sold prices." }
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    throw new Error(`eBay sold search failed (${resp.status}). ${t.slice(0, 200)}`)
  }
  const j = await resp.json()
  const listings = (j.itemSales || []).map((it) => ({
    id: it.itemId || `${it.title}-${it.lastSoldDate}`,
    title: it.title,
    price: it.lastSoldPrice ? Number(it.lastSoldPrice.value) : null,
    currency: it.lastSoldPrice?.currency || 'USD',
    url: it.itemWebUrl || null,
    image: it.image?.imageUrl || it.thumbnailImages?.[0]?.imageUrl || null,
    condition: it.condition || null,
    soldDate: it.lastSoldDate || null,
    source: 'ebay-sold',
  }))
  const prices = listings.map((l) => l.price).filter((n) => n != null).sort((a, b) => a - b)
  const summary = prices.length
    ? {
        count: prices.length,
        avg: Math.round(prices.reduce((s, n) => s + n, 0) / prices.length),
        median: prices[Math.floor(prices.length / 2)],
        low: prices[0],
        high: prices[prices.length - 1],
      }
    : null
  return { configured: true, listings, total: j.total ?? listings.length, summary }
}

// --- handler -----------------------------------------------------------------

const PROVIDERS = { ebay: scanEbay, 'ebay-sold': scanEbaySold }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  let body
  try {
    body = await readBody(req)
  } catch {
    res.status(400).json({ error: 'Invalid request body.' })
    return
  }

  const source = (body.source || 'ebay').toLowerCase()
  const q = (body.query || '').trim()
  const maxPrice = body.maxPrice != null && body.maxPrice !== '' ? Number(body.maxPrice) : null
  const sort = body.sort || 'newest'

  if (!q) {
    res.status(400).json({ error: 'Enter something to search for.' })
    return
  }
  const provider = PROVIDERS[source]
  if (!provider) {
    res.status(400).json({ error: `Unknown marketplace: ${source}` })
    return
  }

  try {
    const out = await provider({ q, maxPrice, sort })
    res.status(200).json({ source, query: q, maxPrice, ...out })
  } catch (err) {
    console.error('scan error:', err)
    res.status(502).json({ error: err?.message || 'Scan failed.' })
  }
}

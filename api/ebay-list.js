// One-click eBay listing via the Sell Inventory API:
//   inventory_item  →  offer  →  publish.
// Requires the user to have connected eBay and to have business policies +
// an inventory location set up in eBay (we fetch and reuse them). Each gate
// returns a clear, actionable message rather than a raw error.

import { userFromAuthHeader, ebayUserAccessToken } from '../lib/ebayServer.js'

export const config = { maxDuration: 60 }

const API = 'https://api.ebay.com'
const MKT = 'EBAY_US'
const COND = { New: 'NEW', 'Like New': 'USED_EXCELLENT', Good: 'USED_GOOD', Fair: 'USED_ACCEPTABLE' }

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

async function ebay(token, method, path, body) {
  const resp = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Language': 'en-US',
      'X-EBAY-C-MARKETPLACE-ID': MKT,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await resp.text()
  let j = {}
  try { j = text ? JSON.parse(text) : {} } catch { /* non-JSON */ }
  return { ok: resp.ok, status: resp.status, j }
}

const firstErr = (r, fallback) => r.j?.errors?.[0]?.message || fallback

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!process.env.EBAY_APP_ID || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(200).json({ configured: false })
    return
  }
  try {
    const user = await userFromAuthHeader(req)
    if (!user) {
      res.status(401).json({ error: 'Please sign in again.' })
      return
    }
    let token
    try {
      token = await ebayUserAccessToken(user.id)
    } catch (e) {
      res.status(200).json({ connected: false, error: e.message })
      return
    }

    const { title, description, price, condition, imageUrls = [] } = await readBody(req)
    if (!title || !price) {
      res.status(400).json({ error: 'A title and price are required.' })
      return
    }
    const images = imageUrls.filter(Boolean).slice(0, 12)
    if (!images.length) {
      res.status(200).json({ needsSetup: true, error: 'Add at least one photo to the item first — eBay requires a photo.' })
      return
    }

    // Business policies + inventory location (set up once in eBay Seller Hub).
    const [ful, pay, ret, loc] = await Promise.all([
      ebay(token, 'GET', `/sell/account/v1/fulfillment_policy?marketplace_id=${MKT}`),
      ebay(token, 'GET', `/sell/account/v1/payment_policy?marketplace_id=${MKT}`),
      ebay(token, 'GET', `/sell/account/v1/return_policy?marketplace_id=${MKT}`),
      ebay(token, 'GET', `/sell/inventory/v1/location`),
    ])
    const fId = ful.j.fulfillmentPolicies?.[0]?.fulfillmentPolicyId
    const pId = pay.j.paymentPolicies?.[0]?.paymentPolicyId
    const rId = ret.j.returnPolicies?.[0]?.returnPolicyId
    const locKey = loc.j.locations?.[0]?.merchantLocationKey
    if (!fId || !pId || !rId) {
      res.status(200).json({ needsSetup: true, error: 'Set up shipping, payment & return business policies in eBay (Seller Hub → Account → Business policies), then try again.' })
      return
    }
    if (!locKey) {
      res.status(200).json({ needsSetup: true, error: 'Add an inventory location in eBay (Seller Hub) first, then try again.' })
      return
    }

    // Auto-pick a category from the title.
    const tree = await ebay(token, 'GET', `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${MKT}`)
    const treeId = tree.j.categoryTreeId
    const sug = treeId
      ? await ebay(token, 'GET', `/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions?q=${encodeURIComponent(title)}`)
      : { j: {} }
    const categoryId = sug.j.categorySuggestions?.[0]?.category?.categoryId
    if (!categoryId) {
      res.status(200).json({ error: 'Could not match an eBay category — try a more specific title.' })
      return
    }

    const sku = `tf-${Date.now()}`
    const inv = await ebay(token, 'PUT', `/sell/inventory/v1/inventory_item/${sku}`, {
      availability: { shipToLocationAvailability: { quantity: 1 } },
      condition: COND[condition] || 'USED_GOOD',
      product: { title: String(title).slice(0, 80), description: String(description || title).slice(0, 4000), imageUrls: images },
    })
    if (!inv.ok) {
      res.status(200).json({ error: firstErr(inv, 'eBay rejected the item details.') })
      return
    }

    const offer = await ebay(token, 'POST', `/sell/inventory/v1/offer`, {
      sku,
      marketplaceId: MKT,
      format: 'FIXED_PRICE',
      availableQuantity: 1,
      categoryId,
      listingDescription: String(description || title).slice(0, 4000),
      listingPolicies: { fulfillmentPolicyId: fId, paymentPolicyId: pId, returnPolicyId: rId },
      pricingSummary: { price: { value: String(Math.round(Number(price) * 100) / 100), currency: 'USD' } },
      merchantLocationKey: locKey,
    })
    if (!offer.ok) {
      res.status(200).json({ error: firstErr(offer, 'eBay rejected the offer.') })
      return
    }

    const pub = await ebay(token, 'POST', `/sell/inventory/v1/offer/${offer.j.offerId}/publish`)
    if (!pub.ok) {
      res.status(200).json({ error: firstErr(pub, 'eBay couldn’t publish the listing (often a missing required item detail for this category).') })
      return
    }

    const listingId = pub.j.listingId
    res.status(200).json({ ok: true, listingId, url: listingId ? `https://www.ebay.com/itm/${listingId}` : null })
  } catch (err) {
    console.error('ebay-list error:', err)
    res.status(500).json({ error: err.message || 'eBay listing failed.' })
  }
}

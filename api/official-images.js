// Pulls candidate product images from a manufacturer / retailer product page
// so the flipper can attach accurate stock photos for an exact model.
// We only ever fetch the page the user (or the evaluation) points us at, and
// the user approves each image — we never guess from random image search.

export const config = { maxDuration: 60 }

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
const JUNK = /sprite|icon|favicon|logo|placeholder|spinner|loading|pixel|1x1|blank|\.svg(\?|$)|badge|flag|payment|visa|paypal|klarna/i

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function absolutize(src, base) {
  try {
    return new URL(src, base).href
  } catch {
    return null
  }
}

function collectLd(node, out, base) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const n of node) collectLd(n, out, base)
    return
  }
  if (node.image) {
    const imgs = Array.isArray(node.image) ? node.image : [node.image]
    for (const im of imgs) {
      const u = typeof im === 'string' ? im : im?.url
      if (u) out.add(absolutize(u, base))
    }
  }
  for (const k in node) if (typeof node[k] === 'object') collectLd(node[k], out, base)
}

function extractImages(html, baseUrl) {
  const out = new Set()

  const og = /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi
  for (const m of html.matchAll(og)) out.add(absolutize(m[1], baseUrl))

  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectLd(JSON.parse(m[1].trim()), out, baseUrl)
    } catch {
      /* ignore malformed JSON-LD */
    }
  }

  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0]
    const src = /(?:data-src|data-original|src)=["']([^"']+)["']/i.exec(tag)?.[1]
    if (src) out.add(absolutize(src, baseUrl))
    const srcset = /(?:data-srcset|srcset)=["']([^"']+)["']/i.exec(tag)?.[1]
    if (srcset) {
      const largest = srcset.split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean).pop()
      if (largest) out.add(absolutize(largest, baseUrl))
    }
  }

  return [...out].filter((u) => u && /^https?:\/\//i.test(u) && !JUNK.test(u))
}

// Rank candidates: prefer URLs that mention the model tokens, then og/ld order.
function rank(urls, model) {
  const tokens = (model || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3)
  const score = (u) => {
    const low = u.toLowerCase()
    let s = 0
    for (const t of tokens) if (low.includes(t)) s += 2
    if (/\b(1[0-9]{3}|2[0-9]{3})x?/.test(low)) s += 1 // looks like it has dimensions
    return s
  }
  return [...new Set(urls)].sort((a, b) => score(b) - score(a))
}

async function fetchImage(u) {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'follow' })
    if (!r.ok) return null
    const ct = (r.headers.get('content-type') || '').toLowerCase()
    const mediaType = MEDIA_TYPES.find((t) => ct.includes(t))
    if (!mediaType) return null
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length < 3000 || buf.length > 3_500_000) return null // skip tiny icons / huge files
    return { dataUrl: `data:${mediaType};base64,${buf.toString('base64')}`, bytes: buf.length }
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const body = await readBody(req)
    const url = (body.url || '').trim()
    if (!/^https?:\/\/.+/i.test(url)) {
      res.status(400).json({ error: 'Provide the manufacturer or product-page URL.' })
      return
    }

    let html
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
        redirect: 'follow',
      })
      html = await resp.text()
    } catch {
      res.status(400).json({ error: "Couldn't open that page. Some sites block bots — try a different product link." })
      return
    }

    const host = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, '')
      } catch {
        return ''
      }
    })()

    const candidates = rank(extractImages(html, url), body.model).slice(0, 10)
    const images = []
    for (const u of candidates) {
      if (images.length >= 6) break
      const img = await fetchImage(u)
      if (img) images.push({ url: u, dataUrl: img.dataUrl, source: host })
    }

    res.status(200).json({
      ok: true,
      source: host,
      images,
      note: images.length ? null : 'No usable product images found on that page — add your own photos instead.',
    })
  } catch (err) {
    console.error('official-images error:', err)
    res.status(500).json({ error: err?.message || 'Could not fetch images.' })
  }
}

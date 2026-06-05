// Finds product images for an exact model so the flipper can attach accurate
// stock photos. Two ways in:
//   1. A URL you paste  -> scrape that page (treated as the exact item).
//   2. brand/model/year -> Claude web-searches for the official product page(s),
//      tags each exact vs. a near-identical model, then we scrape them.
// You approve each image; non-exact ones are disclosed in the listing.

import Anthropic from '@anthropic-ai/sdk'

export const config = { maxDuration: 60 }

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
const JUNK = /sprite|icon|favicon|logo|placeholder|spinner|loading|pixel|1x1|blank|\.svg(\?|$)|badge|flag|payment|visa|paypal|klarna/i

const WEB_SEARCH = { type: 'web_search_20260209', name: 'web_search', max_uses: 5 }
const REPORT_TOOL = {
  name: 'report_sources',
  description: 'Report the product-page URLs you found for the model.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sources: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            url: { type: 'string', description: 'Direct product-page URL.' },
            exact: { type: 'boolean', description: 'true if this is the EXACT model+year; false if a close/similar model.' },
            label: { type: 'string', description: 'Short note, e.g. "manufacturer page, exact" or "similar 2021 model".' },
          },
          required: ['url', 'exact', 'label'],
        },
      },
    },
    required: ['sources'],
  },
}

const FIND_SYSTEM = `You find official manufacturer or major-retailer product pages for a specific piece of outdoor gear, so a reseller can pull accurate product images. Use web_search to locate the EXACT make/model/year's product page. Prefer the manufacturer's own site, then large retailers (REI, Backcountry, Competitive Cyclist, evo, etc.). If you cannot find the exact model/year, you may include a near-identical model — but mark exact=false for it. After searching, call report_sources with up to 3 of the best URLs.`

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
      /* ignore */
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

function rank(urls, model) {
  const tokens = (model || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t.length >= 3)
  const score = (u) => {
    const low = u.toLowerCase()
    let s = 0
    for (const t of tokens) if (low.includes(t)) s += 2
    if (/\b(1[0-9]{3}|2[0-9]{3})x?/.test(low)) s += 1
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
    if (buf.length < 3000 || buf.length > 3_500_000) return null
    return { dataUrl: `data:${mediaType};base64,${buf.toString('base64')}` }
  } catch {
    return null
  }
}

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// Web-search for the exact model's product pages, return [{url, exact, label}].
async function findSources(client, hint) {
  const messages = [
    { role: 'user', content: [{ type: 'text', text: `Find official product pages for: ${hint}. Search the web, then call report_sources with the best URLs (mark each exact or not).` }] },
  ]
  for (let i = 0; i < 4; i++) {
    const msg = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1500,
      system: FIND_SYSTEM,
      tools: [WEB_SEARCH, REPORT_TOOL],
      tool_choice: { type: 'auto' },
      messages,
    })
    const tb = msg.content.find((b) => b.type === 'tool_use' && b.name === 'report_sources')
    if (tb) return Array.isArray(tb.input?.sources) ? tb.input.sources : []
    messages.push({ role: 'assistant', content: msg.content })
    if (msg.stop_reason === 'pause_turn') continue
    // Searched but didn't report — force the structured call once.
    const forced = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1000,
      system: FIND_SYSTEM,
      tools: [REPORT_TOOL],
      tool_choice: { type: 'tool', name: 'report_sources' },
      messages: [...messages, { role: 'user', content: 'Call report_sources now with the product-page URLs you found.' }],
    })
    const fb = forced.content.find((b) => b.type === 'tool_use')
    return fb && Array.isArray(fb.input?.sources) ? fb.input.sources : []
  }
  return []
}

async function scrapeSource(src, hint) {
  let html
  try {
    const resp = await fetch(src.url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow' })
    html = await resp.text()
  } catch {
    return []
  }
  const host = hostOf(src.url)
  const out = []
  for (const u of rank(extractImages(html, src.url), hint).slice(0, 5)) {
    if (out.length >= 4) break
    const img = await fetchImage(u)
    if (img) out.push({ url: u, dataUrl: img.dataUrl, source: host, exact: src.exact !== false })
  }
  return out
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const body = await readBody(req)
    const url = (body.url || '').trim()
    const hint = [body.brand, body.model, body.year].filter(Boolean).join(' ').trim()

    let sources
    if (/^https?:\/\/.+/i.test(url)) {
      sources = [{ url, exact: true, label: 'provided URL' }]
    } else if (hint && process.env.ANTHROPIC_API_KEY) {
      const client = new Anthropic()
      try {
        sources = await findSources(client, hint)
      } catch (e) {
        console.error('findSources failed:', e?.message)
        res.status(502).json({ error: "Couldn't search for that model. Paste a product-page URL instead." })
        return
      }
    } else {
      res.status(400).json({ error: 'Provide a product-page URL, or identify the item first.' })
      return
    }

    const images = []
    for (const s of sources.slice(0, 3)) {
      if (images.length >= 8) break
      const found = await scrapeSource(s, hint || body.model)
      for (const img of found) {
        if (images.length >= 8) break
        images.push(img)
      }
    }

    res.status(200).json({
      ok: true,
      images,
      note: images.length ? null : 'No usable product images found — try pasting a specific product-page URL, or add your own photos.',
    })
  } catch (err) {
    console.error('official-images error:', err)
    res.status(500).json({ error: err?.message || 'Could not fetch images.' })
  }
}

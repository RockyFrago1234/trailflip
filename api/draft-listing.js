import Anthropic from '@anthropic-ai/sdk'

// Two passes (web-search research + forced draft); bounded to fit the 60s limit.
export const config = { maxDuration: 60 }

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const CATEGORIES = ['bikes', 'camping', 'climbing', 'snow', 'water', 'hiking', 'fishing', 'other']
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// Server-side web search (GA on Opus 4.8, built-in dynamic filtering).
const WEB_SEARCH = { type: 'web_search_20260209', name: 'web_search', max_uses: 5 }

const RESEARCH_SYSTEM = `You research a piece of used outdoor gear so a reseller can write a 100% accurate listing. From the photos, identify the exact make / model / year. Then use web_search to look up the manufacturer's owner's manual and official spec sheet for that exact model. Gather real, specific facts: official specifications (sizes, materials, weight, components, capacities, drivetrain, etc.), what's included when sold new, and notable model details. Also inspect the photos for any aftermarket parts or modifications (non-stock components, added accessories, wear, damage). Never invent specs — only report numbers you actually found or can read. Keep it factual and concise.`

const DRAFT_SYSTEM = `You are a top-performing reseller writing marketplace listings for used outdoor gear. Using the photos AND the research notes provided, write a listing so appealing a buyer wants it immediately — while staying scrupulously honest.

Rules:
- Use the researched manufacturer specs for accuracy (sizes, materials, components). Don't contradict the photos.
- State clearly whether the item is STOCK or MODIFIED. If modified, list each non-stock part/change you can see or infer. If it looks fully stock, say so.
- Write a punchy, specific title and a scannable, benefit-driven description: what it's great for, standout specs, what's included, and an honest condition line. No fluff, no AI clichés.
- Suggest a fair asking price (upper-middle of typical used value) that sells fast with healthy margin.
- Add marketplace keywords buyers actually search, and recommend the best platform and timing to sell this specific item.`

function buildDraftText({ note, research }) {
  let t = `Write a complete, desirable marketplace listing for the outdoor gear in the photo(s) using the draft_listing tool. Allowed categories: ${CATEGORIES.join(', ')}.`
  if (note) t += `\n\nSeller's note: ${note}`
  if (research) t += `\n\n--- Research notes (use these for accurate specs; do not contradict the photos) ---\n${research}`
  return t
}

const TOOL = {
  name: 'draft_listing',
  description: 'Produce a ready-to-post marketplace listing draft for the gear in the image(s).',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string', description: 'Compelling, specific title (~50-70 chars). Include brand/model.' },
      category: { type: 'string', enum: CATEGORIES },
      condition: { type: 'string', enum: ['New', 'Like New', 'Good', 'Fair'] },
      description: { type: 'string', description: 'Desirable, scannable description (2-5 short paragraphs / lines). Honest about condition. Make them want it now.' },
      key_specs: { type: 'array', items: { type: 'string' }, description: 'Notable specs / included items — prefer the researched manufacturer specs.' },
      stock_status: { type: 'string', enum: ['stock', 'modified', 'unknown'], description: 'Is the item stock or modified from factory?' },
      modifications: { type: 'array', items: { type: 'string' }, description: 'Specific aftermarket / non-stock parts or changes. Empty array if stock.' },
      repairs: { type: ['string', 'null'], description: 'Any visible damage or repairs needed, stated honestly. Null if none.' },
      keywords: { type: 'array', items: { type: 'string' }, description: 'Search terms buyers type on marketplaces (brand, model, category, key specs, synonyms). 5-12 terms.' },
      best_platform: { type: ['string', 'null'], description: 'Best marketplace for this item (e.g. Facebook Marketplace, eBay, Pinkbike, REI Re/Supply).' },
      best_time: { type: ['string', 'null'], description: 'Best season/timing to list for max return.' },
      spec_source: { type: ['string', 'null'], description: "Where specs came from (e.g. \"manufacturer owner's manual\") or null." },
      brand: { type: ['string', 'null'] },
      model: { type: ['string', 'null'] },
      year: { type: ['string', 'null'] },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      msrp_usd: { type: ['number', 'null'] },
      used_low_usd: { type: ['number', 'null'] },
      used_high_usd: { type: ['number', 'null'] },
      suggested_price_usd: { type: ['number', 'null'], description: 'Recommended asking price in USD — sells fast, healthy margin.' },
      trade_for: { type: ['string', 'null'], description: 'Optional: good things to accept in trade, else null.' },
    },
    required: [
      'title', 'category', 'condition', 'description', 'key_specs', 'stock_status',
      'modifications', 'repairs', 'keywords', 'best_platform', 'best_time', 'spec_source',
      'brand', 'model', 'year', 'confidence', 'msrp_usd', 'used_low_usd',
      'used_high_usd', 'suggested_price_usd', 'trade_for',
    ],
  },
}

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function fetchImageBlock(u) {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'follow' })
    const ct = (r.headers.get('content-type') || '').toLowerCase()
    const mediaType = MEDIA_TYPES.find((t) => ct.includes(t)) || 'image/jpeg'
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > 4_000_000) return null
    return { type: 'image', source: { type: 'base64', media_type: mediaType, data: buf.toString('base64') } }
  } catch {
    return null
  }
}

// Pass A: identify the item + research the owner's manual via web search.
async function runResearch(client, blocks, hint) {
  const messages = [
    {
      role: 'user',
      content: [
        ...blocks,
        {
          type: 'text',
          text: `Research this item${hint ? `: ${hint}` : ''}. Use web_search to find the owner's manual and official specs for the exact model, then summarize your findings in plain text: official specs, what's included new, any visible modifications, and condition notes. If web_search finds nothing useful, summarize from the photos alone.`,
        },
      ],
    },
  ]
  try {
    for (let i = 0; i < 4; i++) {
      const msg = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 3000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system: RESEARCH_SYSTEM,
        tools: [WEB_SEARCH],
        messages,
      })
      if (msg.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: msg.content })
        continue
      }
      return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
    }
  } catch (e) {
    console.error('research pass failed (continuing without it):', e?.message)
  }
  return ''
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'The listing writer is not configured (missing ANTHROPIC_API_KEY).' })
    return
  }
  try {
    const body = await readBody(req)
    const images = Array.isArray(body.images) ? body.images : []
    const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls : []
    const blocks = []
    for (const img of images.slice(0, 8)) {
      const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/s.exec(img || '')
      if (m && MEDIA_TYPES.includes(m[1])) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } })
      }
    }
    for (const u of imageUrls.slice(0, 8 - blocks.length)) {
      if (typeof u !== 'string' || !/^https?:\/\//i.test(u)) continue
      const block = await fetchImageBlock(u)
      if (block) blocks.push(block)
    }
    if (blocks.length === 0) {
      res.status(400).json({ error: 'Add at least one photo first.' })
      return
    }

    const client = new Anthropic()
    const hint = [body.brand, body.model, body.year].filter(Boolean).join(' ') || null

    // Pass A — research (web search). Skipped/empty failures degrade gracefully.
    const research = body.research === false ? '' : await runResearch(client, blocks, hint)

    // Pass B — forced structured draft (no web search → no citation/structured-output conflict).
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 3000,
      system: DRAFT_SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'draft_listing' },
      messages: [{ role: 'user', content: [...blocks, { type: 'text', text: buildDraftText({ note: body.note, research }) }] }],
    })

    const toolBlock = message.content.find((b) => b.type === 'tool_use')
    if (!toolBlock) {
      res.status(502).json({ error: 'Could not draft a listing from those photos. Try a clearer photo.' })
      return
    }
    res.status(200).json({ ok: true, draft: toolBlock.input, researched: Boolean(research) })
  } catch (err) {
    console.error('draft-listing error:', err)
    const msg = err?.error?.error?.message || err?.message || 'Drafting failed.'
    res.status(500).json({ error: msg })
  }
}

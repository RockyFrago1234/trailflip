import Anthropic from '@anthropic-ai/sdk'

export const config = { maxDuration: 60 }

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const CATEGORIES = ['bikes', 'camping', 'climbing', 'snow', 'water', 'hiking', 'fishing', 'other']

const SYSTEM = `You are a top-performing reseller writing marketplace listings for used outdoor gear. From the photo(s) you write a listing so appealing a buyer wants to grab it immediately — while staying honest about condition.

Identify the exact make / model / year when you can. Write a punchy, specific title and a scannable, benefit-driven description: what it's great for, standout features/specs, what's included, and an honest line on condition. Avoid fluff and AI clichés; sound like a knowledgeable human who loves the gear. Suggest a fair asking price that sells fast but leaves the seller a healthy margin (around the upper-middle of typical used value). Pick the single best category from the allowed list.`

function buildText({ note }) {
  let t = `Write a complete, desirable marketplace listing for the outdoor gear in the photo(s). Identify it, then produce the listing via the draft_listing tool. Allowed categories: ${CATEGORIES.join(', ')}.`
  if (note) t += `\n\nSeller's note: ${note}`
  return t
}

const TOOL = {
  name: 'draft_listing',
  description: 'Produce a ready-to-post marketplace listing draft for the gear in the image(s).',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string', description: 'Compelling, specific listing title (~50-70 chars). Include brand/model.' },
      category: { type: 'string', enum: CATEGORIES },
      condition: { type: 'string', enum: ['New', 'Like New', 'Good', 'Fair'] },
      description: { type: 'string', description: 'Desirable, scannable description (2-5 short paragraphs / lines). Honest about condition. Make them want it now.' },
      key_specs: { type: 'array', items: { type: 'string' }, description: 'Notable specs / included items, visible or known.' },
      repairs: { type: ['string', 'null'], description: 'Any visible damage or repairs needed, stated honestly. Null if none visible.' },
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
      'title', 'category', 'condition', 'description', 'key_specs', 'repairs',
      'brand', 'model', 'year', 'confidence', 'msrp_usd', 'used_low_usd',
      'used_high_usd', 'suggested_price_usd', 'trade_for',
    ],
  },
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

// Fetch a hosted image (e.g. an already-uploaded item photo) as a base64 block.
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
    for (const img of images.slice(0, 4)) {
      const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/s.exec(img || '')
      if (m && MEDIA_TYPES.includes(m[1])) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } })
      }
    }
    // Already-uploaded item photos come in as public URLs — fetch them.
    for (const u of imageUrls.slice(0, 4 - blocks.length)) {
      if (typeof u !== 'string' || !/^https?:\/\//i.test(u)) continue
      const block = await fetchImageBlock(u)
      if (block) blocks.push(block)
    }
    if (blocks.length === 0) {
      res.status(400).json({ error: 'Add at least one photo first.' })
      return
    }

    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'draft_listing' },
      messages: [{ role: 'user', content: [...blocks, { type: 'text', text: buildText({ note: body.note }) }] }],
    })

    const toolBlock = message.content.find((b) => b.type === 'tool_use')
    if (!toolBlock) {
      res.status(502).json({ error: 'Could not draft a listing from those photos. Try a clearer photo.' })
      return
    }
    res.status(200).json({ ok: true, draft: toolBlock.input })
  } catch (err) {
    console.error('draft-listing error:', err)
    const msg = err?.error?.error?.message || err?.message || 'Drafting failed.'
    res.status(500).json({ error: msg })
  }
}

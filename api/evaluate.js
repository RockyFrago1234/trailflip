import Anthropic from '@anthropic-ai/sdk'

// Give Claude room to look carefully at the image / page.
export const config = { maxDuration: 60 }

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const SYSTEM = `You are an expert appraiser and reseller of used outdoor gear — bikes, skis/snowboards, climbing, camping, paddle/water, hiking, fishing and similar. You help a flipper decide whether a deal is worth buying to resell.

Scrub every useful detail from the provided image and/or listing text. Be specific and realistic: identify the exact make / model / year when you can; when unsure, say so and lower your confidence rather than guessing precisely. Give all values in USD. Never fabricate an exact MSRP you don't actually know — give a best estimate and reflect uncertainty in the confidence field. List the real, model-specific problems a buyer should check (not generic advice). Rate the deal honestly: a high score means a strong flip (buy low, resell for meaningfully more); an overpriced item scores low even if it's nice gear. Also rate any other dimensions that matter for THIS item (value, condition, resale demand, reliability, rarity, etc.).`

function buildUserText({ note, price, hasImage, hasListing }) {
  let t = `Evaluate this outdoor-gear listing for a potential flip.`
  if (hasImage && hasListing) t += ` You have both a photo and the listing's page text below.`
  else if (hasImage) t += ` You have a photo — it may be a marketplace screenshot (read any visible asking price) or a photo of a real item in front of the buyer (e.g. at a garage sale or thrift store, possibly with no price tag).`
  else if (hasListing) t += ` You have the listing's page text below.`
  if (price) t += `\n\nThe buyer says the asking price is about $${price}.`
  if (note) t += `\n\nBuyer's note: ${note}`
  t += `\n\nScrub all relevant details and return your full assessment using the report_evaluation tool.`
  return t
}

const TOOL = {
  name: 'report_evaluation',
  description: 'Report a structured appraisal of the gear shown in the image / listing.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      identified: { type: 'boolean', description: 'True if you identified the item with reasonable confidence.' },
      brand: { type: ['string', 'null'] },
      model: { type: ['string', 'null'] },
      year: { type: ['string', 'null'], description: 'Model year or generation if known.' },
      category: { type: ['string', 'null'], description: 'e.g. Mountain bike, Snowboard, Tent, Kayak.' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      msrp_usd: { type: ['number', 'null'], description: 'Approx original retail price when new, USD.' },
      used_low_usd: { type: ['number', 'null'], description: 'Low end of typical used resale value, USD.' },
      used_high_usd: { type: ['number', 'null'], description: 'High end of typical used resale value, USD.' },
      listed_price_usd: { type: ['number', 'null'], description: 'Asking price if visible/known, else null.' },
      deal_score: { type: 'integer', description: 'Headline flip strength 0-100 (100 = incredible deal).' },
      verdict: { type: 'string', description: 'Short verdict, e.g. "Strong flip", "Fair price", "Overpriced".' },
      estimated_profit_usd: { type: ['number', 'null'], description: 'Rough profit if bought at listed price and resold mid-range.' },
      key_details: {
        type: 'array',
        items: { type: 'string' },
        description: 'Notable specs/details scrubbed from the listing or image (size, material, components, included items, condition notes).',
      },
      common_issues: { type: 'array', items: { type: 'string' }, description: 'Model-specific problems / failure points to check.' },
      inspection_tips: { type: 'array', items: { type: 'string' }, description: 'What to inspect or ask before buying.' },
      ratings: {
        type: 'array',
        description: 'Scores (0-100) on whatever dimensions are relevant to this item — e.g. Value for money, Condition, Resale demand, Reliability, Rarity. Include only relevant ones.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            label: { type: 'string' },
            score: { type: 'integer', description: '0-100' },
            note: { type: ['string', 'null'] },
          },
          required: ['label', 'score', 'note'],
        },
      },
      manufacturer_url: { type: ['string', 'null'], description: "Manufacturer's product page URL if known, else null." },
      summary: { type: 'string', description: 'One or two sentence overall take.' },
    },
    required: [
      'identified', 'brand', 'model', 'year', 'category', 'confidence',
      'msrp_usd', 'used_low_usd', 'used_high_usd', 'listed_price_usd',
      'deal_score', 'verdict', 'estimated_profit_usd', 'key_details',
      'common_issues', 'inspection_tips', 'ratings', 'manufacturer_url', 'summary',
    ],
  },
}

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
}

function meta(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i')
  const m = re.exec(html)
  if (m) return decodeEntities(m[1])
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i')
  const m2 = re2.exec(html)
  return m2 ? decodeEntities(m2[1]) : null
}

function stripHtml(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  ).trim()
}

async function fetchListing(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
  })
  const html = await resp.text()
  return {
    title: meta(html, 'og:title') || /<title>([^<]+)<\/title>/i.exec(html)?.[1]?.trim() || null,
    description: meta(html, 'og:description'),
    ogImage: meta(html, 'og:image'),
    price: meta(html, 'og:price:amount') || meta(html, 'product:price:amount'),
    text: stripHtml(html).slice(0, 6000),
  }
}

async function fetchImageAsBase64(u) {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'follow' })
    const ct = (r.headers.get('content-type') || '').toLowerCase()
    const mediaType = MEDIA_TYPES.find((t) => ct.includes(t)) || 'image/jpeg'
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > 4_000_000) return null
    return { mediaType, data: buf.toString('base64') }
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
    res.status(500).json({ error: 'The evaluator is not configured yet (missing ANTHROPIC_API_KEY).' })
    return
  }
  try {
    const body = await readBody(req)
    let imageBlock = null
    let listingContext = ''

    // Screenshot path
    if (body.image) {
      const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/s.exec(body.image)
      if (m && MEDIA_TYPES.includes(m[1])) {
        imageBlock = { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }
      }
    }

    // Direct image-URL path (e.g. an uploaded screenshot stored in Supabase) —
    // lets the comparison tool re-appraise a saved candidate any time.
    if (!imageBlock && body.imageUrl) {
      const img = await fetchImageAsBase64(body.imageUrl)
      if (img) imageBlock = { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } }
    }

    // URL path
    if (body.url) {
      let listing
      try {
        listing = await fetchListing(body.url)
      } catch {
        res.status(400).json({ error: "Couldn't fetch that URL (some sites like Facebook block it). Try a screenshot instead." })
        return
      }
      const parts = [`Listing URL: ${body.url}`]
      if (listing.title) parts.push(`Title: ${listing.title}`)
      if (listing.description) parts.push(`Description: ${listing.description}`)
      if (listing.price) parts.push(`Listed price: $${listing.price}`)
      if (listing.text) parts.push(`Page text (truncated):\n${listing.text}`)
      listingContext = parts.join('\n')
      // Pull the listing's main image so Claude can also see it
      if (!imageBlock && listing.ogImage) {
        const img = await fetchImageAsBase64(listing.ogImage)
        if (img) imageBlock = { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } }
      }
    }

    if (!imageBlock && !listingContext) {
      res.status(400).json({ error: 'Provide a screenshot or a listing URL.' })
      return
    }

    const text =
      buildUserText({ note: body.note, price: body.price, hasImage: !!imageBlock, hasListing: !!listingContext }) +
      (listingContext ? `\n\n--- Listing details ---\n${listingContext}` : '')

    const content = []
    if (imageBlock) content.push(imageBlock)
    content.push({ type: 'text', text })

    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'report_evaluation' },
      messages: [{ role: 'user', content }],
    })

    const toolBlock = message.content.find((b) => b.type === 'tool_use')
    if (!toolBlock) {
      res.status(502).json({ error: 'The model did not return a structured evaluation. Try again.' })
      return
    }
    res.status(200).json({ ok: true, evaluation: toolBlock.input })
  } catch (err) {
    console.error('evaluate error:', err)
    const msg = err?.error?.error?.message || err?.message || 'Evaluation failed.'
    res.status(500).json({ error: msg })
  }
}

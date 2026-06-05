import Anthropic from '@anthropic-ai/sdk'

// Give Claude room to look carefully at the image.
export const config = { maxDuration: 60 }

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const SYSTEM = `You are an expert appraiser and reseller of used outdoor gear — bikes, skis/snowboards, climbing, camping, paddle/water, hiking, fishing and similar. You help a flipper decide whether a deal is worth buying to resell.

Be specific and realistic. Identify the exact make / model / year when you can; when unsure, say so and lower your confidence rather than guessing precisely. Give all values in USD. Never fabricate an exact MSRP you don't actually know — give a best estimate and reflect uncertainty in the confidence field. List the real, model-specific problems a buyer should check (not generic advice). Rate the deal honestly: a high score means a strong flip (buy low, resell for meaningfully more); an overpriced item scores low even if it's nice gear.`

function buildUserText({ note, price }) {
  let t = `Evaluate the outdoor gear in this image for a potential flip.

If the image is a marketplace listing or screenshot, read any visible asking price and use it as the listed price.`
  if (price) t += `\n\nThe buyer says the asking price is about $${price}.`
  if (note) t += `\n\nBuyer's note: ${note}`
  t += `\n\nReturn your full assessment using the report_evaluation tool.`
  return t
}

const TOOL = {
  name: 'report_evaluation',
  description: 'Report a structured appraisal of the gear shown in the image.',
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
      deal_score: { type: 'integer', description: 'Flip strength 0-100 (100 = incredible deal, 0 = terrible).' },
      verdict: { type: 'string', description: 'Short verdict, e.g. "Strong flip", "Fair price", "Overpriced".' },
      estimated_profit_usd: { type: ['number', 'null'], description: 'Rough profit if bought at listed price and resold mid-range.' },
      common_issues: { type: 'array', items: { type: 'string' }, description: 'Model-specific problems / failure points to check.' },
      inspection_tips: { type: 'array', items: { type: 'string' }, description: 'What to inspect or ask before buying.' },
      manufacturer_url: { type: ['string', 'null'], description: "Manufacturer's product page URL if known, else null." },
      summary: { type: 'string', description: 'One or two sentence overall take.' },
    },
    required: [
      'identified', 'brand', 'model', 'year', 'category', 'confidence',
      'msrp_usd', 'used_low_usd', 'used_high_usd', 'listed_price_usd',
      'deal_score', 'verdict', 'estimated_profit_usd', 'common_issues',
      'inspection_tips', 'manufacturer_url', 'summary',
    ],
  },
}

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
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
    const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/s.exec(body.image || '')
    if (!match) {
      res.status(400).json({ error: 'Please provide an image.' })
      return
    }
    const [, mediaType, data] = match
    if (!MEDIA_TYPES.includes(mediaType)) {
      res.status(400).json({ error: `Unsupported image type ${mediaType}.` })
      return
    }

    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'report_evaluation' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            { type: 'text', text: buildUserText({ note: body.note, price: body.price }) },
          ],
        },
      ],
    })

    const toolBlock = message.content.find((b) => b.type === 'tool_use')
    if (!toolBlock) {
      res.status(502).json({ error: 'The model did not return a structured evaluation. Try another image.' })
      return
    }
    res.status(200).json({ ok: true, evaluation: toolBlock.input })
  } catch (err) {
    console.error('evaluate error:', err)
    const msg = err?.error?.error?.message || err?.message || 'Evaluation failed.'
    res.status(500).json({ error: msg })
  }
}

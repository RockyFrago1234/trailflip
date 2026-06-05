import Anthropic from '@anthropic-ai/sdk'

// Compares several listings of the SAME kind of item and ranks them for a buyer.
export const config = { maxDuration: 60 }

const SYSTEM = `You are an expert buyer and reseller of used outdoor and household gear helping a flipper choose the BEST listing among several options for the same kind of item.

Weigh every factor that matters for this decision:
- Price vs. real value (an item with strong resale headroom beats a slightly cheaper but overpriced one).
- Condition and any model-specific problems / failure points.
- Location & logistics: closer is cheaper and safer to pick up; heavy/bulky items (e.g. generators) are costly or risky to ship, so a distant listing is worth less in practice.
- Reliability, demand, and rarity.
- Overall risk of the deal.

Rank them from best to worst. Give each a 0–100 "buy score" for THIS buyer (100 = grab it now). Be decisive and concrete — name the specific reasons. Pick one top recommendation. Call out anything that should be avoided. Use the buyer's stated goal/criteria if given.`

const TOOL = {
  name: 'report_comparison',
  description: 'Report a ranked comparison of the candidate listings.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      overall: { type: 'string', description: '2–4 sentences: which to buy and why, plus anything to avoid.' },
      best_id: { type: 'string', description: 'The id of the single best pick.' },
      rankings: {
        type: 'array',
        description: 'Every candidate, ranked.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', description: 'The candidate id you were given.' },
            rank: { type: 'integer', description: '1 = best.' },
            rating: { type: 'integer', description: '0–100 buy score for this buyer.' },
            verdict: { type: 'string', description: 'Short one-line take.' },
            pros: { type: 'array', items: { type: 'string' } },
            cons: { type: 'array', items: { type: 'string' } },
            risk: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          required: ['id', 'rank', 'rating', 'verdict', 'pros', 'cons', 'risk'],
        },
      },
    },
    required: ['overall', 'best_id', 'rankings'],
  },
}

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function candidateBlock(c, i) {
  const e = c.evaluation || {}
  const lines = [`### Candidate ${i + 1} — id: ${c.id}`]
  lines.push(`Title: ${c.title || '(untitled)'}`)
  if (c.price != null) lines.push(`Asking price: $${c.price}`)
  if (c.location) lines.push(`Location: ${c.location}`)
  if (c.condition) lines.push(`Condition (buyer's note): ${c.condition}`)
  const id = [e.brand, e.model, e.year].filter(Boolean).join(' ')
  if (id) lines.push(`AI-identified: ${id}${e.category ? ` (${e.category})` : ''}`)
  if (e.msrp_usd != null) lines.push(`MSRP new: ~$${e.msrp_usd}`)
  if (e.used_low_usd != null || e.used_high_usd != null) lines.push(`Typical used value: $${e.used_low_usd ?? '?'}–$${e.used_high_usd ?? '?'}`)
  if (e.deal_score != null) lines.push(`Evaluator flip score: ${e.deal_score}/100 (${e.verdict || ''})`)
  if (Array.isArray(e.common_issues) && e.common_issues.length) lines.push(`Known issues: ${e.common_issues.slice(0, 5).join('; ')}`)
  if (Array.isArray(e.key_details) && e.key_details.length) lines.push(`Details: ${e.key_details.slice(0, 6).join('; ')}`)
  if (e.summary) lines.push(`AI summary: ${e.summary}`)
  if (!c.evaluation) lines.push('(No AI evaluation available — judge from the basics above.)')
  return lines.join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Comparison is not configured yet (missing ANTHROPIC_API_KEY).' })
    return
  }
  try {
    const body = await readBody(req)
    const candidates = Array.isArray(body.candidates) ? body.candidates : []
    if (candidates.length < 2) {
      res.status(400).json({ error: 'Add at least two listings to compare.' })
      return
    }

    const target = (body.target || '').trim()
    const text =
      (target ? `The buyer is shopping for: ${target}\n\n` : '') +
      `Compare these ${candidates.length} listings and rank them with the report_comparison tool. Use the exact ids given.\n\n` +
      candidates.map(candidateBlock).join('\n\n')

    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 3000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'report_comparison' },
      messages: [{ role: 'user', content: [{ type: 'text', text }] }],
    })

    const toolBlock = message.content.find((b) => b.type === 'tool_use')
    if (!toolBlock) {
      res.status(502).json({ error: 'The model did not return a comparison. Try again.' })
      return
    }
    res.status(200).json({ ok: true, ...toolBlock.input })
  } catch (err) {
    console.error('compare error:', err)
    const msg = err?.error?.error?.message || err?.message || 'Comparison failed.'
    res.status(500).json({ error: msg })
  }
}

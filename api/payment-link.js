// Creates a Stripe Payment Link for an item so a buyer can pay through a link.
// Two calls: make a Price (with an inline product), then a Payment Link.
// Gated on STRIPE_SECRET_KEY — returns { configured:false } until it's set.

export const config = { maxDuration: 30 }

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function form(obj) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(obj)) p.append(k, String(v))
  return p.toString()
}

async function stripe(key, path, body) {
  const resp = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form(body),
  })
  const j = await resp.json()
  if (!resp.ok) throw new Error(j.error?.message || `Stripe ${path} failed (${resp.status}).`)
  return j
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    res.status(200).json({ configured: false })
    return
  }
  try {
    const body = await readBody(req)
    const amount = Math.round(Number(body.amount) * 100)
    if (!amount || amount < 50) {
      res.status(400).json({ error: 'Set a price of at least $0.50 first.' })
      return
    }
    const title = String(body.title || 'TrailFlip item').slice(0, 250)

    const price = await stripe(key, 'prices', {
      unit_amount: amount,
      currency: 'usd',
      'product_data[name]': title,
    })
    const link = await stripe(key, 'payment_links', {
      'line_items[0][price]': price.id,
      'line_items[0][quantity]': 1,
    })

    res.status(200).json({ configured: true, url: link.url })
  } catch (err) {
    console.error('payment-link error:', err)
    res.status(500).json({ error: err?.message || 'Could not create a payment link.' })
  }
}

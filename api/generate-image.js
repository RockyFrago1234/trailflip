// AI product images for listings. Two honest modes:
//   studio        — take the seller's REAL photo and re-light it on a clean
//                    studio background (it's still their actual item).
//   representative — generate a catalog image of the model from its identity;
//                    stored as a "representative" photo and disclosed in listings.
//
// Primary model: OpenAI gpt-image-1. For representative (text→image) we fall back
// to dall-e-3 if gpt-image-1 isn't available (e.g. the org isn't verified yet),
// so it works on more accounts out of the box. Gated on OPENAI_API_KEY.

export const config = { maxDuration: 60 }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function sourceBlob({ image, imageUrl }) {
  if (image) {
    const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/s.exec(image)
    if (!m) throw new Error('Bad image data.')
    return new Blob([Buffer.from(m[2], 'base64')], { type: m[1] })
  }
  if (!imageUrl) throw new Error('No source photo to work from.')
  const r = await fetch(imageUrl, { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error('Could not load the source photo.')
  return new Blob([Buffer.from(await r.arrayBuffer())], { type: r.headers.get('content-type') || 'image/jpeg' })
}

function buildPrompt({ mode, brand, model, year, category, title }) {
  const name = [brand, model, year].filter(Boolean).join(' ') || title || category || 'item'
  if (mode === 'studio') {
    return `Place this exact ${category || 'item'} on a clean, seamless white studio background with soft, even lighting and a subtle floor reflection — professional e-commerce catalog style. Preserve the item's real shape, colors, materials, condition and every detail exactly; do not idealize, repair, or alter it. No text, no watermark, no added props.`
  }
  return `A professional studio product photograph of a ${name}${category ? ` (${category})` : ''}, centered on a clean seamless white background, soft even studio lighting, sharp focus, realistic materials and proportions, high detail, e-commerce catalog style. No text, no watermark, no people.`
}

async function openaiError(resp) {
  const t = await resp.text().catch(() => '')
  let msg = t
  try { msg = JSON.parse(t).error?.message || t } catch { /* keep raw */ }
  return new Error(`(${resp.status}) ${String(msg).slice(0, 240)}`)
}

async function generate(key, model, prompt) {
  const payload =
    model === 'dall-e-3'
      ? { model, prompt, size: '1024x1024', n: 1, response_format: 'b64_json' }
      : { model: 'gpt-image-1', prompt, size: '1024x1024', n: 1 }
  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw await openaiError(resp)
  const j = await resp.json()
  const b64 = j.data?.[0]?.b64_json
  if (!b64) throw new Error('No image returned.')
  return b64
}

async function edit(key, prompt, blob) {
  const form = new FormData()
  form.append('model', 'gpt-image-1')
  form.append('prompt', prompt)
  form.append('size', '1024x1024')
  form.append('image', blob, 'photo.png')
  const resp = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  if (!resp.ok) throw await openaiError(resp)
  const j = await resp.json()
  const b64 = j.data?.[0]?.b64_json
  if (!b64) throw new Error('No image returned.')
  return b64
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    res.status(200).json({ configured: false })
    return
  }
  try {
    const body = await readBody(req)
    const mode = body.mode === 'studio' && (body.image || body.imageUrl) ? 'studio' : 'representative'
    const prompt = buildPrompt({ mode, ...body })

    let b64
    if (mode === 'studio') {
      try {
        b64 = await edit(key, prompt, await sourceBlob(body))
      } catch (e) {
        // gpt-image-1 (and its edits) require a verified org on many accounts.
        const m = String(e.message || '')
        if (/verif/i.test(m)) {
          throw new Error("OpenAI needs your organization verified to use the studio (image-edit) model. Verify at platform.openai.com/settings/organization/general — or use 'Generate representative image', which falls back automatically.", { cause: e })
        }
        throw e
      }
    } else {
      try {
        b64 = await generate(key, 'gpt-image-1', prompt)
      } catch {
        b64 = await generate(key, 'dall-e-3', prompt) // robust fallback
      }
    }
    res.status(200).json({ configured: true, mode, image: `data:image/png;base64,${b64}` })
  } catch (err) {
    console.error('generate-image error:', err)
    res.status(500).json({ error: err?.message || 'Image generation failed.' })
  }
}

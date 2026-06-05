// One-off seed: pushes the starter listings into Supabase.
// Safe to re-run — it skips if the table already has rows.
// Usage: node scripts/seed.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { LISTINGS } from '../src/data/listings.js'

const here = dirname(fileURLToPath(import.meta.url))

// Minimal .env.local parser (Node doesn't auto-load it for scripts)
const env = {}
for (const line of readFileSync(join(here, '..', '.env.local'), 'utf8').split('\n')) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue
  const i = line.indexOf('=')
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
}

const url = env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL / key in .env.local')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const { count, error: countErr } = await supabase
  .from('listings')
  .select('*', { count: 'exact', head: true })
if (countErr) {
  console.error('Count failed:', countErr.message)
  process.exit(1)
}
if (count && count > 0) {
  console.log(`listings already has ${count} rows — skipping seed.`)
  process.exit(0)
}

const rows = LISTINGS.map((l) => ({
  title: l.title,
  category: l.category,
  type: l.type,
  price: l.price ?? null,
  est_resale: l.estResale ?? null,
  condition: l.condition,
  location: l.location,
  emoji: l.emoji,
  seller: l.seller,
  rating: l.rating,
  description: l.description,
  trade_for: l.tradeFor ?? '',
  created_at: new Date(l.postedAt).toISOString(),
}))

const { data, error } = await supabase.from('listings').insert(rows).select('id')
if (error) {
  console.error('Seed failed:', error.message)
  process.exit(1)
}
console.log(`✅ seeded ${data.length} listings into Supabase`)

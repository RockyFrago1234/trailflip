import { supabase } from './supabase'
import { uploadListingPhotos } from './uploadPhotos'

export { uploadListingPhotos }

// Lifecycle statuses, in pipeline order.
export const STATUSES = ['wishlist', 'prospect', 'owned', 'listed', 'sold', 'archived']

// Display metadata for each status (label, emoji, pill classes).
export const STATUS_META = {
  wishlist: { label: 'Wishlist', emoji: '⭐', pill: 'bg-amber-100 text-amber-700' },
  prospect: { label: 'Prospect', emoji: '🔍', pill: 'bg-sky-100 text-sky-700' },
  owned: { label: 'Owned', emoji: '📦', pill: 'bg-violet-100 text-violet-700' },
  listed: { label: 'Listed', emoji: '🏷️', pill: 'bg-forest-100 text-forest-700' },
  sold: { label: 'Sold', emoji: '✅', pill: 'bg-slate-200 text-slate-700' },
  archived: { label: 'Archived', emoji: '🗄️', pill: 'bg-slate-100 text-slate-500' },
}

// Map the evaluator's free-text category to one of our category ids.
const CAT_RULES = [
  [/bike|cycl|\bmtb\b|hardtail|gravel/i, 'bikes'],
  [/climb|harness|\brope\b|carabiner|belay|crash ?pad|quickdraw/i, 'climbing'],
  [/\bski\b|skis|snow|board|splitboard/i, 'snow'],
  [/kayak|paddle|\bsup\b|canoe|raft|wetsuit|drysuit|water/i, 'water'],
  [/hik|\bboot|trekking|trail ?run|backpack(?:ing)?/i, 'hiking'],
  [/fish|reel|\brod\b|tackle|\bfly\b/i, 'fishing'],
  [/tent|camp|sleep|stove|cooler|lantern|hammock/i, 'camping'],
]
export function guessCategory(text = '') {
  for (const [re, id] of CAT_RULES) if (re.test(text)) return id
  return 'other'
}

// Normalized brand|model|year used to spot gear you've already scanned.
export function makeMatchKey(brand, model, year) {
  const s = [brand, model, year]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length >= 3 ? s : null
}

const DATE_KEYS = new Set(['boughtAt', 'listedAt', 'soldAt'])

// snake_case DB row -> camelCase app shape.
export function itemFromRow(r) {
  const ms = (v) => (v ? new Date(v).getTime() : null)
  return {
    id: r.id,
    userId: r.user_id,
    brand: r.brand,
    model: r.model,
    year: r.year,
    category: r.category,
    title: r.title,
    matchKey: r.match_key,
    status: r.status,
    evaluation: r.evaluation,
    draft: r.draft,
    msrp: r.msrp,
    usedLow: r.used_low,
    usedHigh: r.used_high,
    flipScore: r.flip_score,
    askingPrice: r.asking_price,
    buyPrice: r.buy_price,
    boughtAt: ms(r.bought_at),
    buySource: r.buy_source,
    listPrice: r.list_price,
    listedAt: ms(r.listed_at),
    soldPrice: r.sold_price,
    soldAt: ms(r.sold_at),
    soldVia: r.sold_via,
    condition: r.condition,
    description: r.description,
    sourceUrl: r.source_url,
    photos: r.photos || [],
    officialPhotos: r.official_photos || [],
    representativePhotos: r.representative_photos || [],
    tags: r.tags || [],
    notes: r.notes || '',
    createdAt: ms(r.created_at) ?? Date.now(),
    updatedAt: ms(r.updated_at) ?? Date.now(),
  }
}

const FIELD_MAP = {
  brand: 'brand', model: 'model', year: 'year', category: 'category', title: 'title',
  matchKey: 'match_key', status: 'status', evaluation: 'evaluation', draft: 'draft',
  msrp: 'msrp', usedLow: 'used_low', usedHigh: 'used_high', flipScore: 'flip_score',
  askingPrice: 'asking_price', buyPrice: 'buy_price', boughtAt: 'bought_at',
  buySource: 'buy_source', listPrice: 'list_price', listedAt: 'listed_at',
  soldPrice: 'sold_price', soldAt: 'sold_at', soldVia: 'sold_via',
  condition: 'condition', description: 'description', sourceUrl: 'source_url',
  photos: 'photos', officialPhotos: 'official_photos',
  representativePhotos: 'representative_photos', tags: 'tags', notes: 'notes',
}

// camelCase patch -> snake_case row (only provided keys; ms epochs -> ISO).
function rowFromItem(patch) {
  const row = {}
  for (const key in patch) {
    if (!(key in FIELD_MAP) || patch[key] === undefined) continue
    let v = patch[key]
    if (DATE_KEYS.has(key) && typeof v === 'number') v = new Date(v).toISOString()
    row[FIELD_MAP[key]] = v
  }
  return row
}

export async function loadItems(userId) {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(itemFromRow)
}

export async function createItem(userId, fields) {
  const row = { user_id: userId, ...rowFromItem(fields) }
  const { data, error } = await supabase.from('items').insert(row).select().single()
  if (error) throw error
  return itemFromRow(data)
}

export async function updateItem(id, patch) {
  const { data, error } = await supabase
    .from('items')
    .update(rowFromItem(patch))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return itemFromRow(data)
}

export async function deleteItem(id) {
  const { error } = await supabase.from('items').delete().eq('id', id)
  if (error) throw error
}

// Build createItem fields from a saved evaluation.
export function fieldsFromEvaluation(ev, { status = 'prospect', askingPrice = null, sourceUrl = null } = {}) {
  const title = [ev.brand, ev.model, ev.year].filter(Boolean).join(' ') || ev.category || 'Unidentified gear'
  return {
    brand: ev.brand ?? null,
    model: ev.model ?? null,
    year: ev.year ?? null,
    category: guessCategory([ev.category, ev.brand, ev.model].filter(Boolean).join(' ')),
    title,
    matchKey: makeMatchKey(ev.brand, ev.model, ev.year),
    status,
    evaluation: ev,
    msrp: ev.msrp_usd ?? null,
    usedLow: ev.used_low_usd ?? null,
    usedHigh: ev.used_high_usd ?? null,
    flipScore: Number.isFinite(ev.deal_score) ? ev.deal_score : null,
    askingPrice: askingPrice ?? ev.listed_price_usd ?? null,
    condition: 'Good',
    description: ev.summary || '',
    sourceUrl,
  }
}

// A starter listing draft assembled from the saved evaluation — no API call.
// "Rewrite from photos" in the UI can replace this with a photo-grounded draft.
export function baseDraft(item) {
  const ev = item.evaluation || {}
  const title = [item.brand, item.model, item.year].filter(Boolean).join(' ') || item.title
  const price =
    item.listPrice ??
    item.usedHigh ??
    item.usedLow ??
    (item.msrp != null ? Math.round(item.msrp * 0.55) : null)
  return {
    title,
    description: ev.summary || item.description || '',
    key_specs: Array.isArray(ev.key_details) ? ev.key_details : [],
    condition: item.condition || 'Good',
    suggested_price_usd: price,
    stock_status: 'unknown',
    modifications: [],
    keywords: [],
    best_platform: null,
    best_time: null,
    spec_source: null,
  }
}

// Plain-text listing block, ready to paste into Facebook / eBay / Craigslist.
export function buildListingText(item) {
  const d = item.draft || {}
  const lines = []
  lines.push(d.title || item.title)
  lines.push('')
  if (item.listPrice != null) lines.push(`Asking: $${Math.round(item.listPrice).toLocaleString('en-US')}`)
  if (item.condition) lines.push(`Condition: ${item.condition}`)

  // Stock vs modified — be explicit; buyers care a lot.
  if (d.stock_status === 'modified' || (Array.isArray(d.modifications) && d.modifications.length)) {
    lines.push('Modified from stock:')
    for (const m of d.modifications || []) lines.push(`  • ${m}`)
  } else if (d.stock_status === 'stock') {
    lines.push('Configuration: 100% stock / unmodified')
  }

  lines.push('')
  if (d.description || item.description) lines.push(d.description || item.description)

  const specs = d.key_specs || (item.evaluation && item.evaluation.key_details) || []
  if (Array.isArray(specs) && specs.length) {
    lines.push('')
    for (const s of specs) lines.push(`• ${s}`)
  }

  // Disclose any stock/representative photos that aren't the actual item.
  if (Array.isArray(item.representativePhotos) && item.representativePhotos.length) {
    lines.push('')
    lines.push('(Some photos are manufacturer stock images of the same / a near-identical model for reference — actual item is shown in the real photos.)')
  }

  if (Array.isArray(d.keywords) && d.keywords.length) {
    lines.push('')
    lines.push(d.keywords.map((k) => (k.startsWith('#') ? k : `#${k.replace(/\s+/g, '')}`)).join(' '))
  }

  return lines.join('\n').trim()
}

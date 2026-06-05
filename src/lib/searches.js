import { supabase } from './supabase'

function fromRow(s) {
  return { id: s.id, query: s.query, category: s.category, maxPrice: s.max_price, createdAt: s.created_at }
}

export async function loadSearches(userId) {
  const { data, error } = await supabase
    .from('searches')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(fromRow)
}

export async function createSearch(userId, { query, category = null, maxPrice = null }) {
  const { data, error } = await supabase
    .from('searches')
    .insert({ user_id: userId, query: query.trim(), category, max_price: maxPrice })
    .select()
    .single()
  if (error) throw error
  return fromRow(data)
}

export async function deleteSearch(id) {
  const { error } = await supabase.from('searches').delete().eq('id', id)
  if (error) throw error
}

// One-tap search links across the marketplaces a flipper actually hunts on.
export function marketplaceLinks({ query, maxPrice }) {
  const q = encodeURIComponent(query || '')
  const max = maxPrice != null && maxPrice !== '' ? Number(maxPrice) : null
  return [
    { name: 'eBay', url: `https://www.ebay.com/sch/i.html?_nkw=${q}${max ? `&_udhi=${max}` : ''}` },
    { name: 'Facebook', url: `https://www.facebook.com/marketplace/search/?query=${q}${max ? `&maxPrice=${max}` : ''}` },
    { name: 'Craigslist', url: `https://www.craigslist.org/search/sss?query=${q}${max ? `&max_price=${max}` : ''}` },
    { name: 'OfferUp', url: `https://offerup.com/search?q=${q}${max ? `&price_max=${max}` : ''}` },
  ]
}

import { useEffect, useMemo, useState } from 'react'
import { CATEGORIES, LISTINGS } from './data/listings'
import { dealInfo } from './utils/format'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import Header from './components/Header'
import Hero from './components/Hero'
import FilterBar from './components/FilterBar'
import ListingGrid from './components/ListingGrid'
import ListingModal from './components/ListingModal'
import PostListingModal from './components/PostListingModal'
import Footer from './components/Footer'

const LS_SAVED = 'trailflip.saved.v1'

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

// Supabase row (snake_case) -> app listing shape (camelCase)
function fromRow(r) {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    type: r.type,
    price: r.price,
    estResale: r.est_resale,
    condition: r.condition,
    location: r.location,
    emoji: r.emoji,
    seller: r.seller,
    rating: r.rating,
    description: r.description,
    tradeFor: r.trade_for,
    source: r.source,
    url: r.url,
    postedAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
  }
}

export default function App() {
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(() => load(LS_SAVED, []))

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [type, setType] = useState('all')
  const [condition, setCondition] = useState('all')
  const [sort, setSort] = useState('deal')
  const [onlyDeals, setOnlyDeals] = useState(false)
  const [onlySaved, setOnlySaved] = useState(false)

  const [selected, setSelected] = useState(null)
  const [showPost, setShowPost] = useState(false)
  const [toast, setToast] = useState('')

  // Load listings from the shared database (fall back to local seed if offline)
  useEffect(() => {
    let active = true
    async function loadListings() {
      if (!isSupabaseConfigured) {
        if (active) {
          setListings(LISTINGS)
          setLoading(false)
        }
        return
      }
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .order('created_at', { ascending: false })
      if (!active) return
      if (error || !data) {
        console.error('Supabase load failed, using local seed:', error?.message)
        setListings(LISTINGS)
      } else {
        setListings(data.map(fromRow))
      }
      setLoading(false)
    }
    loadListings()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(LS_SAVED, JSON.stringify(saved))
  }, [saved])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2800)
    return () => clearTimeout(t)
  }, [toast])

  const all = listings
  const savedSet = useMemo(() => new Set(saved), [saved])

  const filtered = useMemo(() => {
    let list = all
    if (onlySaved) list = list.filter((l) => savedSet.has(l.id))
    if (category !== 'all') list = list.filter((l) => l.category === category)
    if (type === 'sale') list = list.filter((l) => l.type === 'sale' || l.type === 'both')
    else if (type === 'trade') list = list.filter((l) => l.type === 'trade' || l.type === 'both')
    if (condition !== 'all') list = list.filter((l) => l.condition === condition)
    if (onlyDeals) list = list.filter((l) => dealInfo(l).tier !== 'none')

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((l) =>
        `${l.title} ${l.description} ${l.location}`.toLowerCase().includes(q),
      )
    }

    const sorted = [...list]
    if (sort === 'new') sorted.sort((a, b) => b.postedAt - a.postedAt)
    else if (sort === 'price-asc') sorted.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
    else if (sort === 'price-desc') sorted.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity))
    else sorted.sort((a, b) => dealInfo(b).profit - dealInfo(a).profit)
    return sorted
  }, [all, savedSet, onlySaved, category, type, condition, onlyDeals, query, sort])

  const stats = useMemo(() => {
    const deals = all.filter((l) => dealInfo(l).tier !== 'none')
    const profit = deals.reduce((sum, l) => sum + dealInfo(l).profit, 0)
    return { listings: all.length, deals: deals.length, profit }
  }, [all])

  function toggleSave(id) {
    setSaved((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function addListing(listing) {
    setShowPost(false)
    if (isSupabaseConfigured) {
      const row = {
        title: listing.title,
        category: listing.category,
        type: listing.type,
        price: listing.price,
        est_resale: listing.estResale,
        condition: listing.condition,
        location: listing.location,
        emoji: listing.emoji,
        seller: listing.seller,
        rating: listing.rating,
        description: listing.description,
        trade_for: listing.tradeFor || '',
      }
      const { data, error } = await supabase.from('listings').insert(row).select().single()
      if (error) {
        console.error('Post failed:', error.message)
        setToast('Could not post listing — please try again.')
        return
      }
      setListings((prev) => [fromRow(data), ...prev])
    } else {
      setListings((prev) => [listing, ...prev])
    }
    setToast('Listing posted — live for everyone 🎉')
    setCategory('all')
    setType('all')
    setCondition('all')
    setOnlyDeals(false)
    setOnlySaved(false)
    setQuery('')
    setSort('new')
    scrollToBrowse()
  }

  function resetFilters() {
    setQuery('')
    setCategory('all')
    setType('all')
    setCondition('all')
    setOnlyDeals(false)
    setOnlySaved(false)
    setSort('deal')
  }

  function goHome() {
    resetFilters()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function scrollToBrowse() {
    document.getElementById('browse')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen">
      <Header
        query={query}
        onQuery={setQuery}
        savedCount={saved.length}
        onOpenSaved={() => {
          setOnlySaved(true)
          scrollToBrowse()
        }}
        onPost={() => setShowPost(true)}
        onHome={goHome}
      />

      <Hero stats={stats} onPost={() => setShowPost(true)} onBrowse={scrollToBrowse} />

      <main id="browse" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-8">
        <FilterBar
          categories={CATEGORIES}
          category={category}
          onCategory={setCategory}
          type={type}
          onType={setType}
          condition={condition}
          onCondition={setCondition}
          sort={sort}
          onSort={setSort}
          onlyDeals={onlyDeals}
          onToggleDeals={() => setOnlyDeals((v) => !v)}
          onlySaved={onlySaved}
          onToggleSaved={() => setOnlySaved((v) => !v)}
          savedCount={saved.length}
          count={filtered.length}
        />

        {loading ? (
          <div className="mt-16 flex flex-col items-center justify-center gap-3 text-slate-500">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-forest-600" />
            <p className="text-sm">Loading the latest gear…</p>
          </div>
        ) : (
          <ListingGrid
            listings={filtered}
            savedSet={savedSet}
            onToggleSave={toggleSave}
            onOpen={setSelected}
            onReset={resetFilters}
          />
        )}
      </main>

      <Footer onPost={() => setShowPost(true)} />

      {selected && (
        <ListingModal
          listing={selected}
          saved={savedSet.has(selected.id)}
          onToggleSave={toggleSave}
          onClose={() => setSelected(null)}
        />
      )}

      {showPost && (
        <PostListingModal
          categories={CATEGORIES}
          onClose={() => setShowPost(false)}
          onSubmit={addListing}
        />
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="animate-pop-in rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}

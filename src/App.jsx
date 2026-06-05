import { useEffect, useMemo, useState } from 'react'
import { CATEGORIES, LISTINGS } from './data/listings'
import { dealInfo } from './utils/format'
import Header from './components/Header'
import Hero from './components/Hero'
import FilterBar from './components/FilterBar'
import ListingGrid from './components/ListingGrid'
import ListingModal from './components/ListingModal'
import PostListingModal from './components/PostListingModal'
import Footer from './components/Footer'

const LS_LISTINGS = 'trailflip.listings.v1'
const LS_SAVED = 'trailflip.saved.v1'

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export default function App() {
  const [userListings, setUserListings] = useState(() => load(LS_LISTINGS, []))
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

  useEffect(() => {
    localStorage.setItem(LS_LISTINGS, JSON.stringify(userListings))
  }, [userListings])

  useEffect(() => {
    localStorage.setItem(LS_SAVED, JSON.stringify(saved))
  }, [saved])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2800)
    return () => clearTimeout(t)
  }, [toast])

  const all = useMemo(() => [...userListings, ...LISTINGS], [userListings])
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

  function addListing(listing) {
    setUserListings((prev) => [listing, ...prev])
    setShowPost(false)
    setToast('Listing posted — it is live at the top of the feed 🎉')
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

        <ListingGrid
          listings={filtered}
          savedSet={savedSet}
          onToggleSave={toggleSave}
          onOpen={setSelected}
          onReset={resetFilters}
        />
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

# 🏔️ TrailFlip

**Buy · Sell · Trade outdoor gear — and spot the flips.**

TrailFlip is a marketplace for outdoor people who love a good deal. It's built
around a simple idea: great gear is constantly mispriced, and if you know what
something is really worth, you can buy it, use it, and flip it. Every listing
shows its **flip potential** — buy price vs. estimated resale vs. profit — so the
best deals rise to the top.

## Features

- 🔥 **Flip score on every listing** — buy price, estimated resale, and profit at a glance
- 🔎 **Live search** across titles, descriptions and locations
- 🧭 **Category browsing** — bikes, camping, climbing, ski & snow, water, hiking, fishing & more
- 🎛️ **Filters & sorting** — by type (sale / trade), condition, price, and "best deals"
- ♥ **Save listings** you're watching (persists in your browser)
- ➕ **Post a listing** with a live flip-potential preview (persists in your browser)
- 🤝 **Sale, trade, or both** — trade-only listings show what the seller wants
- 📱 Fully responsive, works offline (no external image dependencies)

## Tech

- [React 19](https://react.dev/) + [Vite](https://vite.dev/)
- [Tailwind CSS](https://tailwindcss.com/) with a custom `forest` / `trail` palette
- State persisted to `localStorage` — no backend required to demo

## Getting started

```bash
npm install      # first time only
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # production build into dist/
npm run preview  # preview the production build
```

## Project structure

```
src/
  data/listings.js        Seed listings + categories
  utils/format.js         Currency, time-ago, and flip-score math
  components/
    Header.jsx            Sticky nav + search + post CTA
    Hero.jsx              Landing hero with live stats
    FilterBar.jsx         Category chips + filters/sort
    ListingCard.jsx       Grid card with flip badge
    ListingGrid.jsx       Responsive grid + empty state
    ListingModal.jsx      Listing detail + flip breakdown
    PostListingModal.jsx  Create a listing (with live flip preview)
    Footer.jsx            Footer
    ImagePlaceholder.jsx  Gradient + emoji "photo"
    Badges.jsx            Type / condition / deal pills
    icons.jsx             Inline SVG icons
  App.jsx                 State + filtering + layout
```

---

Built with React + Tailwind. The next adventure pays for itself. 🥾

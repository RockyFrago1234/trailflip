-- TrailFlip core schema
create extension if not exists pgcrypto;

create table if not exists public.listings (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text not null default 'other',
  type        text not null default 'sale' check (type in ('sale','trade','both')),
  price       numeric,
  est_resale  numeric,
  condition   text not null default 'Good',
  location    text,
  emoji       text default '🧭',
  seller      text not null default 'Anonymous',
  rating      numeric default 5.0,
  description text default '',
  trade_for   text default '',
  source      text,           -- 'ebay' | 'craigslist' | 'facebook' | null (for the deal-finder later)
  url         text,           -- external listing link (for the deal-finder later)
  created_at  timestamptz not null default now()
);

create index if not exists listings_created_at_idx on public.listings (created_at desc);
create index if not exists listings_category_idx on public.listings (category);

alter table public.listings enable row level security;

drop policy if exists "Public read access" on public.listings;
create policy "Public read access" on public.listings
  for select using (true);

drop policy if exists "Anyone can post" on public.listings;
create policy "Anyone can post" on public.listings
  for insert with check (true);

-- TrailFlip catalogue: the flipper's private item lifecycle.
-- One row per piece of gear you've scanned/own. Private to its owner (RLS),
-- unlike the public `listings` marketplace table.

create table if not exists public.items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,

  -- Identity (scrubbed from the AI evaluation). match_key powers re-scan dedup.
  brand        text,
  model        text,
  year         text,
  category     text not null default 'other',
  title        text not null default 'Untitled item',
  match_key    text,

  -- Lifecycle status. wishlist = want to find · prospect = scanned, deciding ·
  -- owned = bought · listed = for sale (can be in use) · sold · archived.
  status       text not null default 'prospect'
               check (status in ('wishlist','prospect','owned','listed','sold','archived')),

  -- The saved AI evaluation (full JSON from /api/evaluate) + an optional
  -- generated listing draft, so you never have to re-submit photos.
  evaluation   jsonb,
  draft        jsonb,

  -- Valuation snapshot
  msrp         numeric,
  used_low     numeric,
  used_high    numeric,
  flip_score   integer,

  -- The flip money trail
  asking_price numeric,      -- what the seller wants (prospect)
  buy_price    numeric,      -- what you paid
  bought_at    timestamptz,
  buy_source   text,         -- facebook | craigslist | ebay | offerup | other
  list_price   numeric,      -- your asking price once listed
  listed_at    timestamptz,
  sold_price   numeric,
  sold_at      timestamptz,
  sold_via     text,

  -- Listing content
  condition    text default 'Good',
  description  text default '',
  source_url   text,         -- original listing link (prospect)

  -- Photos (public Storage URLs). photos = your real shots (cover = [0]);
  -- official_photos = manufacturer images you approved.
  photos          text[] not null default '{}',
  official_photos text[] not null default '{}',

  -- Organization
  tags         text[] not null default '{}',  -- custom folders
  notes        text default '',

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists items_user_status_idx  on public.items (user_id, status);
create index if not exists items_user_match_idx   on public.items (user_id, match_key);
create index if not exists items_user_created_idx on public.items (user_id, created_at desc);

alter table public.items enable row level security;

drop policy if exists "Owners read items" on public.items;
create policy "Owners read items" on public.items
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Owners insert items" on public.items;
create policy "Owners insert items" on public.items
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Owners update items" on public.items;
create policy "Owners update items" on public.items
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Owners delete items" on public.items;
create policy "Owners delete items" on public.items
  for delete to authenticated using (auth.uid() = user_id);

-- Keep updated_at fresh on every change.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists items_touch_updated on public.items;
create trigger items_touch_updated before update on public.items
  for each row execute function public.touch_updated_at();

-- Saved "deal hunts": a target model + max price the flipper is watching for.
-- v1 powers one-tap multi-marketplace search links; the eBay API will later turn
-- these into automatic alerts.
create table if not exists public.searches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  query      text not null,
  category   text,
  max_price  numeric,
  created_at timestamptz not null default now()
);

create index if not exists searches_user_idx on public.searches (user_id, created_at desc);

alter table public.searches enable row level security;

drop policy if exists "Owners read searches" on public.searches;
create policy "Owners read searches" on public.searches
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Owners insert searches" on public.searches;
create policy "Owners insert searches" on public.searches
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Owners delete searches" on public.searches;
create policy "Owners delete searches" on public.searches
  for delete to authenticated using (auth.uid() = user_id);

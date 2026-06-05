-- Business expenses not tied to a single item (store fees, supplies bought in
-- bulk, software, subscriptions, scouting mileage, equipment, etc.).
-- Per-item costs (buy price, selling fees, shipping, supplies, miles) already
-- live on `items`; this captures everything else for the LLC's books.

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null default current_date,
  category    text not null default 'other',
  amount      numeric not null default 0,
  note        text default '',
  created_at  timestamptz not null default now()
);

create index if not exists expenses_user_date_idx on public.expenses (user_id, date desc);

alter table public.expenses enable row level security;

drop policy if exists "Owners read expenses" on public.expenses;
create policy "Owners read expenses" on public.expenses
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Owners insert expenses" on public.expenses;
create policy "Owners insert expenses" on public.expenses
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Owners update expenses" on public.expenses;
create policy "Owners update expenses" on public.expenses
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Owners delete expenses" on public.expenses;
create policy "Owners delete expenses" on public.expenses
  for delete to authenticated using (auth.uid() = user_id);

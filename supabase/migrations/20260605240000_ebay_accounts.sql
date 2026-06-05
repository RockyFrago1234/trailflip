-- Stores each user's eBay OAuth connection (refresh token) so TrailFlip can
-- list on their behalf via the Sell API. Tokens are written by the server with
-- the service role; the owner can read their own row to see "connected" status.

create table if not exists public.ebay_accounts (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  refresh_token      text not null,
  refresh_expires_at timestamptz,
  ebay_user          text,
  updated_at         timestamptz not null default now()
);

alter table public.ebay_accounts enable row level security;

drop policy if exists "Owners read ebay" on public.ebay_accounts;
create policy "Owners read ebay" on public.ebay_accounts
  for select to authenticated using (auth.uid() = user_id);

-- ============ Profiles ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Profiles viewable by everyone" on public.profiles;
create policy "Profiles viewable by everyone" on public.profiles for select using (true);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ Listings ownership ============
alter table public.listings add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists listings_user_id_idx on public.listings (user_id);

drop policy if exists "Anyone can post" on public.listings;
drop policy if exists "Authenticated users can post" on public.listings;
create policy "Authenticated users can post" on public.listings
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Owners can update" on public.listings;
create policy "Owners can update" on public.listings
  for update to authenticated using (auth.uid() = user_id);
drop policy if exists "Owners can delete" on public.listings;
create policy "Owners can delete" on public.listings
  for delete to authenticated using (auth.uid() = user_id);

-- ============ Favorites ============
create table if not exists public.favorites (
  user_id uuid references auth.users(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, listing_id)
);
alter table public.favorites enable row level security;
drop policy if exists "Users manage own favorites" on public.favorites;
create policy "Users manage own favorites" on public.favorites
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

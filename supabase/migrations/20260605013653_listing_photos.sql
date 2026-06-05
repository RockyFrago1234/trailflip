-- Photos on listings (array of public Storage URLs; first = cover)
alter table public.listings add column if not exists photos text[] not null default '{}';

-- Public bucket for listing photos
insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do nothing;

-- Anyone can view; owners manage their own files (stored under <user_id>/...)
drop policy if exists "Public read listing photos" on storage.objects;
create policy "Public read listing photos" on storage.objects
  for select using (bucket_id = 'listing-photos');

drop policy if exists "Users upload own listing photos" on storage.objects;
create policy "Users upload own listing photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update own listing photos" on storage.objects;
create policy "Users update own listing photos" on storage.objects
  for update to authenticated using (bucket_id = 'listing-photos' and owner = auth.uid());

drop policy if exists "Users delete own listing photos" on storage.objects;
create policy "Users delete own listing photos" on storage.objects
  for delete to authenticated using (bucket_id = 'listing-photos' and owner = auth.uid());

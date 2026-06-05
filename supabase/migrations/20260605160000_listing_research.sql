-- Photos of a near-identical model (not the exact item) that must be disclosed
-- in the listing. Kept separate from official_photos (exact-model stock shots).
alter table public.items add column if not exists representative_photos text[] not null default '{}';

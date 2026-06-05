-- Let a business expense be tied to a specific item (travel to pick it up,
-- repairs, parts, item-specific taxes/fees, etc.). Nullable — general expenses
-- still have no item. Deleting an item keeps the expense (just unlinks it) so
-- the books stay intact.

alter table public.expenses
  add column if not exists item_id uuid references public.items(id) on delete set null;

create index if not exists expenses_item_idx on public.expenses (item_id);

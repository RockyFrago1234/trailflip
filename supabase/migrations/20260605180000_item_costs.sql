-- Real cost-of-sale tracking so the P&L shows true NET profit (not just
-- sale - buy). Mileage is logged for the tax deduction (separate from cash net).
alter table public.items add column if not exists fees          numeric; -- marketplace/payment fees
alter table public.items add column if not exists shipping_cost numeric; -- what you paid to ship
alter table public.items add column if not exists supplies_cost numeric; -- box, tape, labels, etc.
alter table public.items add column if not exists miles         numeric; -- round-trip miles for pickup/dropoff

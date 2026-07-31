-- Esegui questo script una sola volta nel SQL Editor di Supabase.
create table if not exists public.participant_accounts (
  name text primary key,
  balance numeric not null default 250000 check (balance >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.garage_cars (
  id uuid primary key default gen_random_uuid(), owner_name text not null references public.participant_accounts(name),
  auction_id uuid not null references public.auctions(id) on delete cascade, auction_name text not null,
  lot_number integer not null, vehicle text not null, purchase_price numeric not null,
  won_at timestamptz not null default now(), unique (auction_id, lot_number)
);
alter table public.participant_accounts enable row level security;
alter table public.garage_cars enable row level security;
create policy "authenticated participant accounts" on public.participant_accounts for all to authenticated using (true) with check (true);
create policy "authenticated garage" on public.garage_cars for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.participant_accounts;
alter publication supabase_realtime add table public.garage_cars;

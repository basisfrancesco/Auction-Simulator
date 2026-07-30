-- Esegui questo script una sola volta nel SQL Editor di Supabase.
alter table public.bids
  add column if not exists lot_number integer not null default 1;

create index if not exists bids_auction_lot_created_idx
  on public.bids (auction_id, lot_number, created_at desc);

alter table public.auctions
  drop constraint if exists auctions_status_check;

alter table public.auctions
  add constraint auctions_status_check
  check (status in ('waiting', 'live', 'between', 'closed'));

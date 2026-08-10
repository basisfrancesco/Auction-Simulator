-- Ripara i database precedenti al multi-lotto e abilita la sincronizzazione live.
-- Non elimina dati e può essere eseguita più volte.
alter table public.bids
  add column if not exists lot_number integer;

update public.bids
set lot_number = 1
where lot_number is null;

-- Se esiste già un lotto aperto, associa correttamente le sue offerte.
update public.bids as b
set lot_number = (a.bot_config->>'lotNumber')::integer
from public.auctions as a
where b.auction_id = a.id
  and a.bot_config ? 'lotNumber'
  and a.bot_config ? 'lotStartedAt'
  and b.created_at >= to_timestamp((a.bot_config->>'lotStartedAt')::numeric / 1000.0);

alter table public.bids
  alter column lot_number set default 1,
  alter column lot_number set not null;

create index if not exists bids_auction_lot_created_idx
  on public.bids (auction_id, lot_number, created_at desc);

-- Queste tabelle devono emettere eventi Postgres Changes verso i browser.
do $$
begin
  alter publication supabase_realtime add table public.auctions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.bids;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.auction_participants;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';

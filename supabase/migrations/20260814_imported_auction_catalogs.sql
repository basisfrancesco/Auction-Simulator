-- Cataloghi esterni normalizzati. La sorgente resta separata dal motore d'asta.
create table if not exists public.auction_lots (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  source text not null,
  source_id text not null,
  source_lot_number text not null,
  position integer not null,
  vehicle text not null,
  category text not null default 'vehicle',
  currency text not null default 'EUR',
  estimate_low numeric,
  estimate_high numeric,
  result_price numeric,
  result_status text not null default '',
  market_value numeric not null,
  start_price numeric not null,
  image_url text not null default '',
  source_url text not null default '',
  collection_name text not null default '',
  status text not null default 'ready' check (status in ('ready', 'active', 'completed', 'skipped')),
  created_at timestamptz not null default now(),
  unique (auction_id, source, source_id),
  unique (auction_id, position)
);

create index if not exists auction_lots_queue_idx on public.auction_lots (auction_id, status, position);
alter table public.auction_lots enable row level security;
drop policy if exists "Authenticated users can read auction lots" on public.auction_lots;
create policy "Authenticated users can read auction lots" on public.auction_lots for select to authenticated using (true);
drop policy if exists "Authenticated users can manage auction lots" on public.auction_lots;
create policy "Authenticated users can manage auction lots" on public.auction_lots for all to authenticated using (true) with check (true);

create or replace function public.start_auction_catalog_lot(
  p_auction_id uuid,
  p_catalog_lot_id uuid,
  p_target_bids integer,
  p_bots jsonb
) returns table(lot_number integer, ends_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  a public.auctions%rowtype;
  catalog_lot public.auction_lots%rowtype;
  next_lot integer;
  started_at timestamptz := clock_timestamp();
  deadline timestamptz := started_at + interval '10 seconds';
  config jsonb;
begin
  select * into a from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'Asta non trovata'; end if;
  if a.status not in ('waiting', 'between') then raise exception 'Non è possibile avviare un nuovo lotto'; end if;
  select * into catalog_lot from public.auction_lots
    where id = p_catalog_lot_id and auction_id = p_auction_id and status = 'ready' for update;
  if not found then raise exception 'Lotto di catalogo non disponibile'; end if;

  next_lot := jsonb_array_length(coalesce(a.bot_config->'results', '[]'::jsonb)) + 1;
  config := jsonb_build_object(
    'bots', coalesce(p_bots, '[]'::jsonb), 'nextBotAt', (extract(epoch from started_at) * 1000 + 800)::bigint,
    'vehicle', catalog_lot.vehicle, 'lotNumber', next_lot,
    'catalogLotId', catalog_lot.id, 'results', coalesce(a.bot_config->'results', '[]'::jsonb),
    'lotStartedAt', (extract(epoch from started_at) * 1000)::bigint
  );
  update public.auction_lots set status = 'active' where id = catalog_lot.id;
  update public.auctions set status = 'live', start_price = catalog_lot.start_price,
    current_price = catalog_lot.start_price, ends_at = deadline, winner = null,
    target_bids = greatest(1, p_target_bids), bot_config = config where id = p_auction_id;
  return query select next_lot, deadline;
end;
$$;

-- Completa il record di coda insieme alla chiusura atomica già esistente.
create or replace function public.complete_active_catalog_lot(p_auction_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.auction_lots set status = 'completed'
  where auction_id = p_auction_id and status = 'active';
end;
$$;

revoke all on function public.start_auction_catalog_lot(uuid, uuid, integer, jsonb) from public;
revoke all on function public.complete_active_catalog_lot(uuid) from public;
grant execute on function public.start_auction_catalog_lot(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.complete_active_catalog_lot(uuid) to authenticated;

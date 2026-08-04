-- Rende atomiche tutte le transizioni critiche del motore d'asta.
-- Eseguire nel SQL Editor di Supabase prima di pubblicare il client aggiornato.

create or replace function public.auction_server_now_ms()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

create or replace function public.start_auction_lot(
  p_auction_id uuid,
  p_vehicle text,
  p_start_price numeric,
  p_target_bids integer,
  p_bots jsonb
) returns table(lot_number integer, ends_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.auctions%rowtype;
  next_lot integer;
  started_at timestamptz := clock_timestamp();
  deadline timestamptz := started_at + interval '10 seconds';
  config jsonb;
begin
  select * into a from public.auctions where id = p_auction_id for update;
  if not found then raise exception 'Asta non trovata'; end if;
  if a.status not in ('waiting', 'between') then raise exception 'Non è possibile avviare un nuovo lotto'; end if;
  if coalesce(trim(p_vehicle), '') = '' then raise exception 'Automobile non valida'; end if;
  if p_start_price < 100 then raise exception 'Prezzo iniziale non valido'; end if;

  next_lot := jsonb_array_length(coalesce(a.bot_config->'results', '[]'::jsonb)) + 1;
  config := jsonb_build_object(
    'bots', coalesce(p_bots, '[]'::jsonb),
    'nextBotAt', (extract(epoch from started_at) * 1000 + 800)::bigint,
    'vehicle', trim(p_vehicle),
    'lotNumber', next_lot,
    'results', coalesce(a.bot_config->'results', '[]'::jsonb),
    'lotStartedAt', (extract(epoch from started_at) * 1000)::bigint
  );

  update public.auctions
  set status = 'live', start_price = p_start_price, current_price = p_start_price,
      ends_at = deadline, winner = null, target_bids = greatest(1, p_target_bids),
      bot_config = config
  where id = p_auction_id;

  return query select next_lot, deadline;
end;
$$;

create or replace function public.place_bot_bid(
  p_auction_id uuid,
  p_expected_price numeric,
  p_bidder_name text,
  p_amount numeric,
  p_bots jsonb,
  p_next_bot_at bigint
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.auctions%rowtype;
  last_bidder text;
  current_lot integer;
begin
  select * into a from public.auctions where id = p_auction_id for update;
  if not found or a.status <> 'live' or clock_timestamp() >= a.ends_at or a.current_price <> p_expected_price then
    return false;
  end if;

  current_lot := coalesce((a.bot_config->>'lotNumber')::integer, 1);
  select bidder_name into last_bidder from public.bids
  where auction_id = p_auction_id and lot_number = current_lot
  order by amount desc, created_at desc limit 1;

  if last_bidder = p_bidder_name or p_amount <= a.current_price then return false; end if;

  insert into public.bids (auction_id, bidder_name, amount, is_bot, lot_number)
  values (p_auction_id, p_bidder_name, p_amount, true, current_lot);

  update public.auctions
  set current_price = p_amount,
      ends_at = clock_timestamp() + interval '10 seconds',
      bot_config = jsonb_set(
        jsonb_set(coalesce(bot_config, '{}'::jsonb), '{bots}', coalesce(p_bots, '[]'::jsonb), true),
        '{nextBotAt}', to_jsonb(p_next_bot_at), true
      )
  where id = p_auction_id;
  return true;
end;
$$;

create or replace function public.schedule_bot_attempt(
  p_auction_id uuid,
  p_expected_price numeric,
  p_bots jsonb,
  p_next_bot_at bigint
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.auctions
  set bot_config = jsonb_set(
    jsonb_set(coalesce(bot_config, '{}'::jsonb), '{bots}', coalesce(p_bots, '[]'::jsonb), true),
    '{nextBotAt}', to_jsonb(p_next_bot_at), true
  )
  where id = p_auction_id and status = 'live' and current_price = p_expected_price and clock_timestamp() < ends_at;
  return found;
end;
$$;

create or replace function public.close_auction_lot(p_auction_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.auctions%rowtype;
  current_lot integer;
  winning_bid public.bids%rowtype;
  result jsonb;
begin
  select * into a from public.auctions where id = p_auction_id for update;
  if not found or a.status <> 'live' or clock_timestamp() < a.ends_at then return false; end if;

  current_lot := coalesce((a.bot_config->>'lotNumber')::integer, 1);
  select * into winning_bid from public.bids
  where auction_id = p_auction_id and lot_number = current_lot
  order by amount desc, created_at desc limit 1;

  result := jsonb_build_object(
    'lotNumber', current_lot,
    'vehicle', coalesce(a.bot_config->>'vehicle', ''),
    'winner', coalesce(winning_bid.bidder_name, 'Nessun offerente'),
    'finalPrice', coalesce(winning_bid.amount, a.current_price),
    'bidCount', (select count(*) from public.bids where auction_id = p_auction_id and lot_number = current_lot)
  );

  if winning_bid.id is not null and not winning_bid.is_bot then
    update public.participant_accounts
    set balance = greatest(0, balance - winning_bid.amount)
    where name = winning_bid.bidder_name;
    if not found then raise exception 'Conto del vincitore non disponibile'; end if;

    insert into public.garage_cars
      (owner_name, auction_id, auction_name, lot_number, vehicle, purchase_price)
    values
      (winning_bid.bidder_name, a.id, a.name, current_lot, a.bot_config->>'vehicle', winning_bid.amount);
  end if;

  update public.auctions
  set status = 'waiting', winner = coalesce(winning_bid.bidder_name, 'Nessun offerente'),
      current_price = coalesce(winning_bid.amount, a.current_price),
      bot_config = jsonb_build_object(
        'bots', '[]'::jsonb, 'nextBotAt', 0,
        'vehicle', coalesce(a.bot_config->>'vehicle', ''),
        'lotNumber', current_lot,
        'results', coalesce(a.bot_config->'results', '[]'::jsonb) || jsonb_build_array(result),
        'lotStartedAt', coalesce((a.bot_config->>'lotStartedAt')::bigint, 0)
      )
  where id = p_auction_id;
  return true;
end;
$$;

-- Aggiorna anche la puntata partecipante esistente: scadenza server-side e lotto esplicito.
create or replace function public.place_participant_bid(
  p_auction_id uuid,
  p_bidder_id uuid,
  p_bidder_name text
) returns table(amount numeric, ends_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.auctions%rowtype;
  last_bidder text;
  account_balance numeric;
  step_value numeric;
  rounding_value numeric;
  percentage_value numeric;
  next_amount numeric;
  current_lot integer;
  deadline timestamptz;
begin
  if auth.uid() is null or auth.uid() <> p_bidder_id then raise exception 'Sessione non valida'; end if;
  select * into a from public.auctions where id = p_auction_id for update;
  if not found or a.status <> 'live' then raise exception 'Il lotto non è più attivo'; end if;
  if clock_timestamp() >= a.ends_at then raise exception 'Il tempo per offrire è scaduto'; end if;
  if not exists (select 1 from public.auction_participants where auction_id = p_auction_id and user_id = p_bidder_id and user_name = p_bidder_name) then raise exception 'Non sei iscritto a questa asta'; end if;

  current_lot := coalesce((a.bot_config->>'lotNumber')::integer, 1);
  select bidder_name into last_bidder from public.bids
  where auction_id = p_auction_id and lot_number = current_lot
  order by amount desc, created_at desc limit 1;
  if last_bidder = p_bidder_name then raise exception 'Sei già il miglior offerente'; end if;

  select balance into account_balance from public.participant_accounts where name = p_bidder_name for update;
  if account_balance is null then raise exception 'Saldo non disponibile'; end if;

  percentage_value := case when a.current_price / greatest(a.start_price, 1) < 1.12 then .006 when a.current_price / greatest(a.start_price, 1) < 1.3 then .009 when a.current_price / greatest(a.start_price, 1) < 1.55 then .013 else .018 end;
  rounding_value := case when a.current_price < 10000 then 50 when a.current_price < 50000 then 100 when a.current_price < 150000 then 250 else 500 end;
  step_value := greatest(rounding_value, round(greatest(50, a.current_price * percentage_value) / rounding_value) * rounding_value);
  next_amount := a.current_price + step_value;
  if next_amount > account_balance then raise exception 'Saldo insufficiente'; end if;

  deadline := clock_timestamp() + interval '10 seconds';
  insert into public.bids (auction_id, bidder_id, bidder_name, amount, is_bot, lot_number)
  values (p_auction_id, p_bidder_id, p_bidder_name, next_amount, false, current_lot);
  update public.auctions set current_price = next_amount, ends_at = deadline,
    bot_config = jsonb_set(coalesce(bot_config, '{}'::jsonb), '{nextBotAt}', to_jsonb((extract(epoch from clock_timestamp()) * 1000 + 1200)::bigint), true)
    where id = p_auction_id;
  return query select next_amount, deadline;
end;
$$;

revoke all on function public.auction_server_now_ms() from public;
revoke all on function public.start_auction_lot(uuid, text, numeric, integer, jsonb) from public;
revoke all on function public.place_bot_bid(uuid, numeric, text, numeric, jsonb, bigint) from public;
revoke all on function public.schedule_bot_attempt(uuid, numeric, jsonb, bigint) from public;
revoke all on function public.close_auction_lot(uuid) from public;
revoke all on function public.place_participant_bid(uuid, uuid, text) from public;
grant execute on function public.auction_server_now_ms() to authenticated;
grant execute on function public.start_auction_lot(uuid, text, numeric, integer, jsonb) to authenticated;
grant execute on function public.place_bot_bid(uuid, numeric, text, numeric, jsonb, bigint) to authenticated;
grant execute on function public.schedule_bot_attempt(uuid, numeric, jsonb, bigint) to authenticated;
grant execute on function public.close_auction_lot(uuid) to authenticated;
grant execute on function public.place_participant_bid(uuid, uuid, text) to authenticated;

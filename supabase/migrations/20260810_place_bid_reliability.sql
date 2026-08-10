-- Puntata partecipante indipendente dall'ID della precedente sessione anonima.
-- L'app identifica i profili demo per nome; auth.uid() garantisce comunque
-- che la richiesta provenga da una sessione Supabase autenticata.
create or replace function public.place_participant_bid_v2(
  p_auction_id uuid,
  p_bidder_name text
) returns table(amount numeric, ends_at timestamptz, lot_number integer)
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
  if auth.uid() is null then raise exception 'Sessione non valida'; end if;

  select * into a
  from public.auctions
  where id = p_auction_id
  for update;

  if not found or a.status <> 'live' then raise exception 'Il lotto non è più attivo'; end if;
  if clock_timestamp() >= a.ends_at then raise exception 'Il tempo per offrire è scaduto'; end if;

  -- L'iscrizione segue il profilo scelto, anche se la sessione anonima è stata
  -- rinnovata o il partecipante è entrato da un altro dispositivo.
  if not exists (
    select 1 from public.auction_participants
    where auction_id = p_auction_id and user_name = p_bidder_name
  ) then
    raise exception 'Non sei iscritto a questa asta';
  end if;

  current_lot := coalesce((a.bot_config->>'lotNumber')::integer, 1);
  select bidder_name into last_bidder
  from public.bids as b
  where b.auction_id = p_auction_id and b.lot_number = current_lot
  order by b.amount desc, b.created_at desc
  limit 1;
  if last_bidder = p_bidder_name then raise exception 'Sei già il miglior offerente'; end if;

  select balance into account_balance
  from public.participant_accounts
  where name = p_bidder_name
  for update;
  if account_balance is null then raise exception 'Saldo non disponibile'; end if;

  percentage_value := case
    when a.current_price / greatest(a.start_price, 1) < 1.12 then .006
    when a.current_price / greatest(a.start_price, 1) < 1.3 then .009
    when a.current_price / greatest(a.start_price, 1) < 1.55 then .013
    else .018
  end;
  rounding_value := case
    when a.current_price < 10000 then 50
    when a.current_price < 50000 then 100
    when a.current_price < 150000 then 250
    else 500
  end;
  step_value := greatest(rounding_value, round(greatest(50, a.current_price * percentage_value) / rounding_value) * rounding_value);
  next_amount := a.current_price + step_value;
  if next_amount > account_balance then raise exception 'Saldo insufficiente'; end if;

  deadline := clock_timestamp() + interval '10 seconds';
  insert into public.bids (auction_id, bidder_id, bidder_name, amount, is_bot, lot_number)
  values (p_auction_id, auth.uid(), p_bidder_name, next_amount, false, current_lot);

  update public.auctions
  set current_price = next_amount,
      ends_at = deadline,
      bot_config = jsonb_set(
        coalesce(bot_config, '{}'::jsonb),
        '{nextBotAt}',
        to_jsonb((extract(epoch from clock_timestamp()) * 1000 + 1200)::bigint),
        true
      )
  where id = p_auction_id;

  return query select next_amount, deadline, current_lot;
end;
$$;

revoke all on function public.place_participant_bid_v2(uuid, text) from public;
grant execute on function public.place_participant_bid_v2(uuid, text) to authenticated;
notify pgrst, 'reload schema';

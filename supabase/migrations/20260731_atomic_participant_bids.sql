-- Esegui una volta nel SQL Editor di Supabase.
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
  lot_started timestamptz;
begin
  if auth.uid() is null or auth.uid() <> p_bidder_id then raise exception 'Sessione non valida'; end if;
  select * into a from public.auctions where id = p_auction_id for update;
  if not found or a.status <> 'live' then raise exception 'Il lotto non è più attivo'; end if;
  if not exists (select 1 from public.auction_participants where auction_id = p_auction_id and user_id = p_bidder_id and user_name = p_bidder_name) then raise exception 'Non sei iscritto a questa asta'; end if;

  lot_started := to_timestamp(coalesce((a.bot_config->>'lotStartedAt')::numeric, 0) / 1000.0);
  select bidder_name into last_bidder from public.bids
    where auction_id = p_auction_id and created_at >= lot_started
    order by created_at desc limit 1;
  if last_bidder = p_bidder_name then raise exception 'Sei già il miglior offerente'; end if;

  select balance into account_balance from public.participant_accounts where name = p_bidder_name for update;
  if account_balance is null then raise exception 'Saldo non disponibile'; end if;

  percentage_value := case when a.current_price / greatest(a.start_price, 1) < 1.12 then .006 when a.current_price / greatest(a.start_price, 1) < 1.3 then .009 when a.current_price / greatest(a.start_price, 1) < 1.55 then .013 else .018 end;
  rounding_value := case when a.current_price < 10000 then 50 when a.current_price < 50000 then 100 when a.current_price < 150000 then 250 else 500 end;
  step_value := greatest(rounding_value, round(greatest(50, a.current_price * percentage_value) / rounding_value) * rounding_value);
  next_amount := a.current_price + step_value;
  if next_amount > account_balance then raise exception 'Saldo insufficiente'; end if;

  insert into public.bids (auction_id, bidder_id, bidder_name, amount, is_bot) values (p_auction_id, p_bidder_id, p_bidder_name, next_amount, false);
  update public.auctions set current_price = next_amount, ends_at = now() + interval '10 seconds',
    bot_config = jsonb_set(coalesce(bot_config, '{}'::jsonb), '{nextBotAt}', to_jsonb((extract(epoch from now()) * 1000 + 1200)::bigint), true)
    where id = p_auction_id;
  return query select next_amount, now() + interval '10 seconds';
end;
$$;

revoke all on function public.place_participant_bid(uuid, uuid, text) from public;
grant execute on function public.place_participant_bid(uuid, uuid, text) to authenticated;

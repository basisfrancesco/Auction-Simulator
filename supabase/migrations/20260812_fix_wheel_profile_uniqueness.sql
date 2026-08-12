-- I profili selezionabili condividono la sessione anonima del dispositivo.
-- L'unicità dell'iscrizione deve quindi essere basata sul profilo, non su auth.uid().
alter table public.auction_participants
  drop constraint if exists auction_participants_auction_id_user_id_key;

delete from public.auction_participants a
using public.auction_participants b
where a.auction_id = b.auction_id
  and a.user_name = b.user_name
  and a.ctid < b.ctid;

alter table public.auction_participants
  drop constraint if exists auction_participants_auction_id_user_name_key;
alter table public.auction_participants
  add constraint auction_participants_auction_id_user_name_key unique (auction_id, user_name);

create or replace function public.join_auction_with_wheel(p_auction_id uuid, p_user_name text)
returns table(reward numeric, balance_after numeric, already_spun boolean)
language plpgsql security definer set search_path = public as $$
declare
  previous public.auction_wheel_spins%rowtype;
  roll integer;
  prize numeric;
  resulting_balance numeric;
begin
  if auth.uid() is null then raise exception 'Sessione non valida'; end if;
  if not exists (select 1 from public.auctions where id = p_auction_id and status in ('waiting', 'between', 'live')) then
    raise exception 'Asta non disponibile';
  end if;

  select * into previous from public.auction_wheel_spins
  where auction_id = p_auction_id and user_name = p_user_name for update;
  if found then
    insert into public.auction_participants (auction_id, user_id, user_name)
    values (p_auction_id, auth.uid(), p_user_name)
    on conflict (auction_id, user_name) do update set user_id = excluded.user_id;
    return query select previous.reward, previous.balance_after, true;
    return;
  end if;

  perform 1 from public.participant_accounts where name = p_user_name for update;
  if not found then raise exception 'Conto partecipante non disponibile'; end if;

  roll := floor(random() * 50)::integer;
  prize := case
    when roll < 40 then 500000
    when roll = 40 then 2000000
    when roll = 41 then 5000000
    when roll = 42 then -1000000
    when roll = 43 then -2000000
    when roll between 44 and 46 then 250000
    else 750000
  end;

  update public.participant_accounts set balance = greatest(0, balance + prize)
  where name = p_user_name returning balance into resulting_balance;
  insert into public.auction_participants (auction_id, user_id, user_name)
  values (p_auction_id, auth.uid(), p_user_name)
  on conflict (auction_id, user_name) do update set user_id = excluded.user_id;
  insert into public.auction_wheel_spins (auction_id, user_id, user_name, reward, balance_after)
  values (p_auction_id, auth.uid(), p_user_name, prize, resulting_balance);
  return query select prize, resulting_balance, false;
end $$;

revoke all on function public.join_auction_with_wheel(uuid, text) from public;
grant execute on function public.join_auction_with_wheel(uuid, text) to authenticated;
notify pgrst, 'reload schema';

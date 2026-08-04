-- Vendita diretta a un acquirente esterno alla piattaforma.
-- Accredito e uscita dell'auto dal garage avvengono nella stessa transazione.
create or replace function public.sell_car_externally(p_car_id uuid, p_seller_name text, p_price numeric)
returns boolean language plpgsql security definer set search_path = public as $$
declare c public.garage_cars%rowtype;
begin
  if auth.uid() is null then raise exception 'Sessione non valida'; end if;
  if p_price < 100 or p_price > 100000000 then raise exception 'Il prezzo deve essere compreso tra 100 € e 100.000.000 €'; end if;

  select * into c from public.garage_cars where id = p_car_id for update;
  if not found or c.owner_name <> p_seller_name or c.sold_at is not null then
    raise exception 'Automobile non disponibile';
  end if;
  if exists (select 1 from public.car_listings where car_id = p_car_id and status = 'active') then
    raise exception 'Ritira prima l’annuncio dal mercato';
  end if;

  perform 1 from public.participant_accounts where name = p_seller_name for update;
  if not found then raise exception 'Conto venditore non disponibile'; end if;

  update public.garage_cars set sold_at = clock_timestamp(), sale_price = p_price where id = p_car_id;
  update public.participant_accounts set balance = balance + p_price where name = p_seller_name;
  return true;
end $$;

revoke all on function public.sell_car_externally(uuid, text, numeric) from public;
grant execute on function public.sell_car_externally(uuid, text, numeric) to authenticated;

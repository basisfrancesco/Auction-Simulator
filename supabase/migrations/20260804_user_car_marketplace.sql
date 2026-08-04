-- Mercato auto tra partecipanti. Tutte le operazioni economiche sono atomiche.
create table if not exists public.car_listings (
  id uuid primary key default gen_random_uuid(), car_id uuid not null references public.garage_cars(id) on delete cascade,
  seller_id uuid not null, seller_name text not null references public.participant_accounts(name),
  vehicle text not null, image_url text, price numeric not null check (price > 0),
  status text not null default 'active' check (status in ('active', 'sold', 'cancelled')),
  buyer_id uuid, buyer_name text references public.participant_accounts(name),
  created_at timestamptz not null default now(), completed_at timestamptz
);
create unique index if not exists car_listings_one_active_per_car on public.car_listings(car_id) where status = 'active';
create index if not exists car_listings_active_created on public.car_listings(created_at desc) where status = 'active';
alter table public.car_listings enable row level security;
drop policy if exists "authenticated listings read" on public.car_listings;
create policy "authenticated listings read" on public.car_listings for select to authenticated using (true);

create or replace function public.list_car_for_sale(p_car_id uuid, p_seller_name text, p_price numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.garage_cars%rowtype; listing_id uuid;
begin
  if auth.uid() is null then raise exception 'Sessione non valida'; end if;
  if p_price < 100 or p_price > 100000000 then raise exception 'Il prezzo deve essere compreso tra 100 € e 100.000.000 €'; end if;
  select * into c from public.garage_cars where id = p_car_id for update;
  if not found or c.owner_name <> p_seller_name or c.sold_at is not null then raise exception 'Automobile non disponibile'; end if;
  if exists (select 1 from public.car_listings where car_id = p_car_id and status = 'active') then raise exception 'Automobile già in vendita'; end if;
  insert into public.car_listings(car_id, seller_id, seller_name, vehicle, image_url, price)
  values (c.id, auth.uid(), p_seller_name, c.vehicle, c.image_url, p_price) returning id into listing_id;
  return listing_id;
end $$;

create or replace function public.cancel_car_listing(p_listing_id uuid, p_seller_name text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.car_listings set status = 'cancelled', completed_at = clock_timestamp()
  where id = p_listing_id and seller_name = p_seller_name and status = 'active';
  if not found then raise exception 'Annuncio non disponibile o non autorizzato'; end if;
  return true;
end $$;

create or replace function public.buy_listed_car(p_listing_id uuid, p_buyer_name text)
returns boolean language plpgsql security definer set search_path = public as $$
declare l public.car_listings%rowtype; buyer_balance numeric;
begin
  if auth.uid() is null then raise exception 'Sessione non valida'; end if;
  select * into l from public.car_listings where id = p_listing_id for update;
  if not found or l.status <> 'active' then raise exception 'Annuncio non più disponibile'; end if;
  if l.seller_name = p_buyer_name then raise exception 'Non puoi acquistare la tua automobile'; end if;
  select balance into buyer_balance from public.participant_accounts where name = p_buyer_name for update;
  if buyer_balance is null then raise exception 'Conto acquirente non disponibile'; end if;
  if buyer_balance < l.price then raise exception 'Saldo insufficiente'; end if;
  perform 1 from public.participant_accounts where name = l.seller_name for update;
  if not found then raise exception 'Conto venditore non disponibile'; end if;
  perform 1 from public.garage_cars where id = l.car_id and owner_name = l.seller_name and sold_at is null for update;
  if not found then raise exception 'Automobile non più disponibile'; end if;
  update public.participant_accounts set balance = balance - l.price where name = p_buyer_name;
  update public.participant_accounts set balance = balance + l.price where name = l.seller_name;
  update public.garage_cars set owner_name = p_buyer_name where id = l.car_id;
  update public.car_listings set status = 'sold', buyer_id = auth.uid(), buyer_name = p_buyer_name, completed_at = clock_timestamp() where id = l.id;
  return true;
end $$;

revoke all on function public.list_car_for_sale(uuid, text, numeric) from public;
revoke all on function public.cancel_car_listing(uuid, text) from public;
revoke all on function public.buy_listed_car(uuid, text) from public;
grant execute on function public.list_car_for_sale(uuid, text, numeric) to authenticated;
grant execute on function public.cancel_car_listing(uuid, text) to authenticated;
grant execute on function public.buy_listed_car(uuid, text) to authenticated;
do $$ begin alter publication supabase_realtime add table public.car_listings; exception when duplicate_object then null; end $$;

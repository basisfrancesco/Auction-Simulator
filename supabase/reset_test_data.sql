-- ATTENZIONE: elimina definitivamente tutti i dati di prova dell'applicazione.
-- Mantiene tabelle, policy, bucket Storage e utenti anonimi di Supabase Auth.

begin;

delete from public.car_listings;
delete from public.garage_cars;
delete from public.bids;
delete from public.auction_participants;
delete from public.auctions;
delete from public.participant_accounts;

insert into public.participant_accounts (name, balance)
values
  ('Francesco Basis', 250000),
  ('Vittorio Esposito', 250000),
  ('Carlo Esposito', 250000),
  ('Lorenzo Biava', 250000),
  ('Giulia Test', 180000),
  ('Matteo Test', 165000);

insert into public.auctions (id, name)
values ('00000000-0000-4000-8000-000000000901', 'Garage Demo');

insert into public.garage_cars
  (id, owner_name, auction_id, auction_name, lot_number, vehicle, purchase_price, won_at)
values
  ('00000000-0000-4000-8000-000000000911', 'Giulia Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 901, 'Porsche 718 Cayman', 62000, now() - interval '40 days'),
  ('00000000-0000-4000-8000-000000000912', 'Giulia Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 902, 'Alfa Romeo Giulia Quadrifoglio', 54000, now() - interval '28 days'),
  ('00000000-0000-4000-8000-000000000913', 'Matteo Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 903, 'BMW M4 Competition', 68000, now() - interval '35 days'),
  ('00000000-0000-4000-8000-000000000914', 'Matteo Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 904, 'Mercedes-AMG A 45 S', 49000, now() - interval '19 days');

commit;

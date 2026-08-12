-- ATTENZIONE: elimina definitivamente tutti i dati di prova dell'applicazione.
-- Mantiene tabelle, policy, bucket Storage e utenti anonimi di Supabase Auth.

begin;

delete from public.auction_wheel_spins;
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
  ('Matteo Test', 165000),
  ('Sofia Test', 420000),
  ('Luca Test', 310000),
  ('Elena Test', 850000),
  ('Marco Test', 275000);

insert into public.auctions (id, name)
values ('00000000-0000-4000-8000-000000000901', 'Garage Demo');

insert into public.garage_cars
  (id, owner_name, auction_id, auction_name, lot_number, vehicle, purchase_price, won_at)
values
  ('00000000-0000-4000-8000-000000000911', 'Giulia Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 901, 'Porsche 718 Cayman', 62000, now() - interval '40 days'),
  ('00000000-0000-4000-8000-000000000912', 'Giulia Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 902, 'Alfa Romeo Giulia Quadrifoglio', 54000, now() - interval '28 days'),
  ('00000000-0000-4000-8000-000000000913', 'Matteo Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 903, 'BMW M4 Competition', 68000, now() - interval '35 days'),
  ('00000000-0000-4000-8000-000000000914', 'Matteo Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 904, 'Mercedes-AMG A 45 S', 49000, now() - interval '19 days'),
  ('00000000-0000-4000-8000-000000000921', 'Sofia Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 921, 'Ferrari Roma', 205000, now() - interval '31 days'),
  ('00000000-0000-4000-8000-000000000922', 'Sofia Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 922, 'Audi RS6 Avant', 128000, now() - interval '18 days'),
  ('00000000-0000-4000-8000-000000000923', 'Luca Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 923, 'Porsche 911 GT3', 218000, now() - interval '45 days'),
  ('00000000-0000-4000-8000-000000000924', 'Luca Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 924, 'Toyota GR Supra', 61000, now() - interval '14 days'),
  ('00000000-0000-4000-8000-000000000925', 'Elena Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 925, 'Lamborghini Huracan STO', 315000, now() - interval '52 days'),
  ('00000000-0000-4000-8000-000000000926', 'Elena Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 926, 'Mercedes-AMG GT Black Series', 355000, now() - interval '23 days'),
  ('00000000-0000-4000-8000-000000000927', 'Marco Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 927, 'Ford Mustang Shelby GT500', 118000, now() - interval '27 days'),
  ('00000000-0000-4000-8000-000000000928', 'Marco Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 928, 'Nissan GT-R', 142000, now() - interval '12 days');

commit;

-- Quattro profili aggiuntivi con garage eterogenei per testare mercato e vendite.
insert into public.participant_accounts (name, balance)
values ('Sofia Test', 420000), ('Luca Test', 310000), ('Elena Test', 850000), ('Marco Test', 275000)
on conflict (name) do nothing;

insert into public.auctions (id, name)
values ('00000000-0000-4000-8000-000000000901', 'Garage Demo')
on conflict (id) do nothing;

insert into public.garage_cars
  (id, owner_name, auction_id, auction_name, lot_number, vehicle, purchase_price, won_at)
values
  ('00000000-0000-4000-8000-000000000921', 'Sofia Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 921, 'Ferrari Roma', 205000, now() - interval '31 days'),
  ('00000000-0000-4000-8000-000000000922', 'Sofia Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 922, 'Audi RS6 Avant', 128000, now() - interval '18 days'),
  ('00000000-0000-4000-8000-000000000923', 'Luca Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 923, 'Porsche 911 GT3', 218000, now() - interval '45 days'),
  ('00000000-0000-4000-8000-000000000924', 'Luca Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 924, 'Toyota GR Supra', 61000, now() - interval '14 days'),
  ('00000000-0000-4000-8000-000000000925', 'Elena Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 925, 'Lamborghini Huracan STO', 315000, now() - interval '52 days'),
  ('00000000-0000-4000-8000-000000000926', 'Elena Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 926, 'Mercedes-AMG GT Black Series', 355000, now() - interval '23 days'),
  ('00000000-0000-4000-8000-000000000927', 'Marco Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 927, 'Ford Mustang Shelby GT500', 118000, now() - interval '27 days'),
  ('00000000-0000-4000-8000-000000000928', 'Marco Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 928, 'Nissan GT-R', 142000, now() - interval '12 days')
on conflict (id) do nothing;

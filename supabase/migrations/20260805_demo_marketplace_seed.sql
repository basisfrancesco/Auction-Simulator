-- Due partecipanti e quattro automobili demo per provare il mercato tra utenti.
insert into public.participant_accounts (name, balance)
values ('Giulia Test', 180000), ('Matteo Test', 165000)
on conflict (name) do update set balance = excluded.balance;

insert into public.auctions (id, name)
values ('00000000-0000-4000-8000-000000000901', 'Garage Demo')
on conflict (id) do nothing;

insert into public.garage_cars
  (id, owner_name, auction_id, auction_name, lot_number, vehicle, purchase_price, won_at)
values
  ('00000000-0000-4000-8000-000000000911', 'Giulia Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 901, 'Porsche 718 Cayman', 62000, now() - interval '40 days'),
  ('00000000-0000-4000-8000-000000000912', 'Giulia Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 902, 'Alfa Romeo Giulia Quadrifoglio', 54000, now() - interval '28 days'),
  ('00000000-0000-4000-8000-000000000913', 'Matteo Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 903, 'BMW M4 Competition', 68000, now() - interval '35 days'),
  ('00000000-0000-4000-8000-000000000914', 'Matteo Test', '00000000-0000-4000-8000-000000000901', 'Garage Demo', 904, 'Mercedes-AMG A 45 S', 49000, now() - interval '19 days')
on conflict (id) do nothing;

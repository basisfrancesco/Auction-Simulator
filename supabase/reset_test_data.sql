-- ATTENZIONE: elimina definitivamente tutti i dati di prova dell'applicazione.
-- Mantiene tabelle, policy, bucket Storage e utenti anonimi di Supabase Auth.

begin;

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
  ('Lorenzo Biava', 250000);

commit;

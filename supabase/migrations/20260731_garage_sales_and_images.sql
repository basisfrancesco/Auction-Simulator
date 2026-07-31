-- Esegui una volta nel SQL Editor di Supabase.
alter table public.garage_cars add column if not exists image_url text;
alter table public.garage_cars add column if not exists sold_at timestamptz;
alter table public.garage_cars add column if not exists sale_price numeric check (sale_price is null or sale_price > 0);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('garage-images', 'garage-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public = true, file_size_limit = 5242880;

drop policy if exists "garage images read" on storage.objects;
create policy "garage images read" on storage.objects for select using (bucket_id = 'garage-images');
drop policy if exists "garage images upload" on storage.objects;
create policy "garage images upload" on storage.objects for insert to authenticated with check (bucket_id = 'garage-images');
drop policy if exists "garage images update" on storage.objects;
create policy "garage images update" on storage.objects for update to authenticated using (bucket_id = 'garage-images') with check (bucket_id = 'garage-images');

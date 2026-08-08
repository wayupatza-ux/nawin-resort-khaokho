-- unit-photos: public bucket, anyone can view (needed for guest-app booking
-- UI), only owner can upload/manage (via dashboard using their own session,
-- not service role, so this needs a real INSERT/UPDATE/DELETE policy).
insert into storage.buckets (id, name, public)
values ('unit-photos', 'unit-photos', true);

create policy unit_photos_public_read on storage.objects
  for select using (bucket_id = 'unit-photos');

create policy unit_photos_owner_write on storage.objects
  for insert with check (bucket_id = 'unit-photos' and public.is_owner());

create policy unit_photos_owner_update on storage.objects
  for update using (bucket_id = 'unit-photos' and public.is_owner());

create policy unit_photos_owner_delete on storage.objects
  for delete using (bucket_id = 'unit-photos' and public.is_owner());

-- payment-slips: private bucket. Guests upload via guest-api (service role,
-- bypasses storage RLS entirely). Staff need to review slips from the
-- dashboard using their own session, so they get a read policy; no public
-- access and no direct guest/anon access at all.
insert into storage.buckets (id, name, public)
values ('payment-slips', 'payment-slips', false);

create policy payment_slips_staff_read on storage.objects
  for select using (bucket_id = 'payment-slips' and public.is_staff());

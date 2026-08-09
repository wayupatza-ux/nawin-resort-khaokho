-- Bookings could previously be deleted by any staff member, because
-- bookings_staff_all (0008) is a single FOR ALL policy covering
-- select/insert/update/delete. Split it so delete is owner-only while
-- staff keep full select/insert/update access.

drop policy if exists bookings_staff_all on public.bookings;

create policy bookings_staff_select on public.bookings
  for select using (public.is_staff());

create policy bookings_staff_insert on public.bookings
  for insert with check (public.is_staff());

create policy bookings_staff_update on public.bookings
  for update using (public.is_staff()) with check (public.is_staff());

create policy bookings_owner_delete on public.bookings
  for delete using (public.is_owner());

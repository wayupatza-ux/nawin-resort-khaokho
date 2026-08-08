-- Link bookings.created_by to profiles so we can join the staff member's
-- name for commission tracking (who booked it -> whose commission it is).
-- LIFF self-service bookings keep created_by null (no staff commission).
alter table public.bookings
  add constraint bookings_created_by_fkey
  foreign key (created_by) references public.profiles(id);

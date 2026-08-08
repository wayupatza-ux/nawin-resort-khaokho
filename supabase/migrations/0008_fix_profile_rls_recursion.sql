-- Bug fix: profiles_select_staff policy referenced public.profiles from
-- within its own policy predicate, causing infinite recursion (42P17) the
-- moment any staff-gated query ran under the `authenticated` role (i.e. the
-- real dashboard, not the service-role/postgres SQL editor which bypasses
-- RLS entirely and never hit this). Every "staff can read/write" policy
-- across bookings/guests/guest_documents/payments/etc. has the same
-- self-referencing shape and was equally broken.
--
-- Fix: SECURITY DEFINER helper functions owned by the table owner (bypasses
-- RLS on the internal lookup, since ownership grants bypass unless FORCE ROW
-- LEVEL SECURITY is set, which it isn't) — no recursion, single source of
-- truth for "is this uid staff/owner".

create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

create or replace function public.is_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner');
$$;

revoke all on function public.is_staff() from public;
revoke all on function public.is_owner() from public;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_owner() to authenticated;

-- profiles
drop policy if exists profiles_select_staff on public.profiles;
create policy profiles_select_staff on public.profiles
  for select using (public.is_staff());

-- bookings
drop policy if exists bookings_staff_all on public.bookings;
create policy bookings_staff_all on public.bookings
  for all using (public.is_staff()) with check (public.is_staff());

-- guests
drop policy if exists guests_staff_all on public.guests;
create policy guests_staff_all on public.guests
  for all using (public.is_staff()) with check (public.is_staff());

-- guest_documents
drop policy if exists guest_documents_staff_all on public.guest_documents;
create policy guest_documents_staff_all on public.guest_documents
  for all using (public.is_staff()) with check (public.is_staff());

-- booking_status_history
drop policy if exists booking_status_history_staff_select on public.booking_status_history;
create policy booking_status_history_staff_select on public.booking_status_history
  for select using (public.is_staff());

-- payments
drop policy if exists payments_staff_all on public.payments;
create policy payments_staff_all on public.payments
  for all using (public.is_staff()) with check (public.is_staff());

-- notifications_log
drop policy if exists notifications_log_staff_select on public.notifications_log;
create policy notifications_log_staff_select on public.notifications_log
  for select using (public.is_staff());

-- audit_log
drop policy if exists audit_log_owner_select on public.audit_log;
create policy audit_log_owner_select on public.audit_log
  for select using (public.is_owner());

-- units (from 0007)
drop policy if exists units_owner_write on public.units;
create policy units_owner_write on public.units
  for all using (public.is_owner()) with check (public.is_owner());

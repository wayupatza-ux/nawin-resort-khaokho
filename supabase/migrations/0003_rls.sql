-- RLS: default deny on every table, explicit per-role policies.
-- Guest-facing access (booking/my-bookings/cancel) goes through the
-- `guest-api` edge function using the service role key, which bypasses RLS
-- and authorizes manually in code (see supabase/functions/guest-api). Direct
-- anon/authenticated access from the browser is therefore NOT granted on
-- guests/bookings/guest_documents/payments — only `units` (public catalog)
-- is readable directly for the booking UI to show availability.

alter table public.units enable row level security;
alter table public.guests enable row level security;
alter table public.guest_documents enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_status_history enable row level security;
alter table public.payments enable row level security;
alter table public.notifications_log enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;
alter table public.line_webhook_events enable row level security;

-- units: public read-only catalog (needed by guest-app to list units + prices)
create policy units_select_all on public.units
  for select using (true);

-- profiles: a user can read their own profile; staff/owner can read all
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

create policy profiles_select_staff on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid())
  );

-- Everything else: staff (any authenticated user with a profiles row) can
-- read/write. No anon policies — guest access always goes through the
-- service-role edge function.
create policy bookings_staff_all on public.bookings
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid()))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy guests_staff_all on public.guests
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid()))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy guest_documents_staff_all on public.guest_documents
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid()))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy booking_status_history_staff_select on public.booking_status_history
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy payments_staff_all on public.payments
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid()))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy notifications_log_staff_select on public.notifications_log
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy audit_log_owner_select on public.audit_log
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

-- No policies on line_webhook_events at all — only the line-webhook edge
-- function (service role) ever touches it.

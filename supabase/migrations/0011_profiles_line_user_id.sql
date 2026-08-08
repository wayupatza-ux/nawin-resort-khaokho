-- Link a staff member's LINE account to their profile, so the staff-api
-- edge function can identify "who is booking this" from a LIFF ID token
-- alone (no separate login) — same value used for commission tracking via
-- bookings.created_by.
alter table public.profiles add column line_user_id text unique;

-- Only the owner can link/change staff LINE accounts (profiles previously
-- had no write policy at all — rows were only ever inserted via SQL by
-- service role). Uses the existing is_owner() helper (0008) to avoid the
-- same self-referencing-policy recursion bug fixed there.
create policy profiles_owner_update on public.profiles
  for update using (public.is_owner())
  with check (public.is_owner());

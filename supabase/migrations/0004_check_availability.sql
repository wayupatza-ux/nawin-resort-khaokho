-- Simple availability check: true if no overlapping active booking exists
-- for this unit across [check_in, check_out). SECURITY DEFINER so the
-- guest-app (using the anon key, no bookings SELECT policy) can call it
-- without exposing booking rows directly.
create or replace function public.check_availability(
  p_unit_id uuid,
  p_check_in date,
  p_check_out date
) returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.bookings b
    where b.unit_id = p_unit_id
      and b.status in ('pending', 'confirmed', 'checked_in')
      and daterange(b.check_in, b.check_out) && daterange(p_check_in, p_check_out)
  );
$$;

revoke all on function public.check_availability(uuid, date, date) from public;
grant execute on function public.check_availability(uuid, date, date) to anon, authenticated;

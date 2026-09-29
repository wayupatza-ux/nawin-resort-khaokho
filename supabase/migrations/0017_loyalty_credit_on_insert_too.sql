-- Fix found via testing 0016: the loyalty-credit trigger only fired on
-- UPDATE, so a booking inserted directly with status='checked_out' (doesn't
-- happen through guest-api/staff-api/dashboard today, but shouldn't be a
-- silent gap either) earned nothing. Match the existing
-- bookings_log_status_change trigger's pattern (after insert or update).

create or replace function public.credit_loyalty_night_earned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nights int;
begin
  if new.status = 'checked_out'
     and (tg_op = 'INSERT' or old.status is distinct from 'checked_out')
     and new.guest_id is not null then
    v_nights := (new.check_out - new.check_in);
    insert into public.loyalty_ledger (guest_id, booking_id, property, event_type, nights_delta, note)
    values (new.guest_id, new.id, 'khaokho', 'night_earned', v_nights, 'auto-credited on checkout')
    on conflict (booking_id) where event_type = 'night_earned' and booking_id is not null do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_credit_loyalty on public.bookings;

create trigger bookings_credit_loyalty
  after insert or update on public.bookings
  for each row
  execute function public.credit_loyalty_night_earned();

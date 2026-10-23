-- 1) The 24h unpaid auto-cancel (0012) cancelled every pending booking,
--    including ones staff/owner keyed in by hand (3YTVHQ, บอสตอง's friend,
--    agreed to pay on the 26th — auto-cancelled 22 Oct 2026 12:30; re-keyed as
--    Q5L9SN). Only guest
--    self-bookings from LINE should expire; staff-entered bookings stay pending
--    until someone changes them.
-- 2) booking_status_history already logs every transition, but only with
--    auth.uid() — system changes show as "nobody" and deleted bookings take
--    their history with them. Record *who or what* made each change (actor),
--    keep the booking_ref, and keep history when a booking is deleted.

alter table public.booking_status_history
  add column if not exists actor text,
  add column if not exists booking_ref text,
  alter column booking_id drop not null,
  alter column new_status drop not null;

alter table public.booking_status_history
  drop constraint if exists booking_status_history_booking_id_fkey;
alter table public.booking_status_history
  add constraint booking_status_history_booking_id_fkey
  foreign key (booking_id) references public.bookings(id) on delete set null;

update public.booking_status_history h
  set booking_ref = b.booking_ref
  from public.bookings b
  where b.id = h.booking_id and h.booking_ref is null;

-- Who/what changed the status:
--   app.actor (set by system jobs via set_config)  e.g. 'auto-cancel: unpaid 24h'
--   else the logged-in user                         'staff'
--   else by booking source                          'agoda-sync' / 'line-guest' / 'system'
create or replace function public.log_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := nullif(current_setting('app.actor', true), '');
  v_row public.bookings;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  if v_actor is null then
    v_actor := case
      when auth.uid() is not null then 'staff'
      when v_row.source = 'agoda' then 'agoda-sync'
      when v_row.source = 'liff' then 'line-guest'
      else 'system'
    end;
  end if;

  if tg_op = 'DELETE' then
    insert into public.booking_status_history (booking_id, booking_ref, old_status, new_status, changed_by, actor)
    values (null, old.booking_ref, old.status, null, auth.uid(), v_actor || ' (deleted)');
    return old;
  end if;

  if (tg_op = 'INSERT') or (new.status is distinct from old.status) then
    insert into public.booking_status_history (booking_id, booking_ref, old_status, new_status, changed_by, actor)
    values (new.id, new.booking_ref, case when tg_op = 'INSERT' then null else old.status end, new.status, auth.uid(), v_actor);
  end if;
  return new;
end;
$$;

revoke all on function public.log_booking_status_change() from public, anon, authenticated;

drop trigger if exists bookings_log_status_change on public.bookings;
create trigger bookings_log_status_change
  after insert or update or delete on public.bookings
  for each row
  execute function public.log_booking_status_change();

create or replace function public.cancel_expired_pending_bookings()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.actor', 'auto-cancel: LINE booking unpaid 24h', true);
  update public.bookings
  set status = 'cancelled'
  where status = 'pending'
    and source = 'liff'
    and created_at < now() - interval '24 hours';
end;
$$;

revoke all on function public.cancel_expired_pending_bookings() from public, anon, authenticated;

-- 3YTVHQ is NOT restored: บอสตอง had it re-keyed as Q5L9SN (confirmed, paid) on 23 Oct 2026.

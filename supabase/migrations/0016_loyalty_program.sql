-- Loyalty program: stay 10 nights, get 1 free night. Shared across the whole
-- Nawin group (Khaokho bookings auto-credit; Don Mueang nights are credited
-- manually by owner/manager since Don Mueang runs on a third-party PMS with
-- no guest/LINE identity feed into this project).
--
-- Ledger design (not a running-balance column) so every credit/debit is
-- individually auditable if a guest disputes their balance later.

create table public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id),
  booking_id uuid references public.bookings(id),
  property text not null check (property in ('khaokho', 'donmueang')),
  event_type text not null check (event_type in ('night_earned', 'free_night_redeemed')),
  nights_delta int not null,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index loyalty_ledger_guest_id_idx on public.loyalty_ledger (guest_id);

-- One night_earned row per booking, ever — guards against double-crediting
-- if a booking's status oscillates (e.g. checked_out -> checked_in -> checked_out).
create unique index loyalty_ledger_booking_earned_uidx
  on public.loyalty_ledger (booking_id)
  where event_type = 'night_earned' and booking_id is not null;

alter table public.loyalty_ledger enable row level security;

-- Staff/owner can read (dashboard); no direct insert/update/delete policy —
-- all writes go through the SECURITY DEFINER functions below (trigger for
-- auto-earn, RPCs for redemption/manual credit), same pattern as
-- booking_status_history / notifications_log.
create policy loyalty_ledger_staff_select on public.loyalty_ledger
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid()));

-- Balance = floor(total nights earned / 10) - free nights already redeemed.
create or replace function public.get_loyalty_balance(p_guest_id uuid)
returns table (total_nights_earned int, free_nights_redeemed int, free_nights_available int)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(sum(nights_delta) filter (where event_type = 'night_earned'), 0)::int as total_nights_earned,
    coalesce(-sum(nights_delta) filter (where event_type = 'free_night_redeemed'), 0)::int as free_nights_redeemed,
    (
      coalesce(sum(nights_delta) filter (where event_type = 'night_earned'), 0) / 10
      - coalesce(-sum(nights_delta) filter (where event_type = 'free_night_redeemed'), 0)
    )::int as free_nights_available
  from public.loyalty_ledger
  where guest_id = p_guest_id;
$$;

revoke all on function public.get_loyalty_balance(uuid) from public;
grant execute on function public.get_loyalty_balance(uuid) to anon, authenticated;

-- Auto-credit nights when a Khaokho booking is marked checked_out.
create or replace function public.credit_loyalty_night_earned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nights int;
begin
  if new.status = 'checked_out' and (old.status is distinct from 'checked_out') and new.guest_id is not null then
    v_nights := (new.check_out - new.check_in);
    insert into public.loyalty_ledger (guest_id, booking_id, property, event_type, nights_delta, note)
    values (new.guest_id, new.id, 'khaokho', 'night_earned', v_nights, 'auto-credited on checkout')
    on conflict (booking_id) where event_type = 'night_earned' and booking_id is not null do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.credit_loyalty_night_earned() from public, anon, authenticated;

create trigger bookings_credit_loyalty
  after update on public.bookings
  for each row
  execute function public.credit_loyalty_night_earned();

-- Redeem 1 free night for a guest. Callable by any staff/owner (any row in
-- profiles). Advisory-locks per guest to stop two staff redeeming at once
-- from both passing the balance check before either write lands.
create or replace function public.redeem_free_night(p_guest_id uuid, p_property text, p_booking_id uuid default null, p_note text default null)
returns table (free_nights_available int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available int;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid()) then
    raise exception 'only staff can redeem loyalty nights';
  end if;
  if p_property not in ('khaokho', 'donmueang') then
    raise exception 'invalid property: %', p_property;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_guest_id::text));

  select b.free_nights_available into v_available from public.get_loyalty_balance(p_guest_id) b;
  if v_available is null or v_available < 1 then
    raise exception 'guest % has no free nights available', p_guest_id;
  end if;

  insert into public.loyalty_ledger (guest_id, booking_id, property, event_type, nights_delta, note, created_by)
  values (p_guest_id, p_booking_id, p_property, 'free_night_redeemed', -1, p_note, auth.uid());

  return query select b.free_nights_available from public.get_loyalty_balance(p_guest_id) b;
end;
$$;

revoke all on function public.redeem_free_night(uuid, text, uuid, text) from public, anon;
grant execute on function public.redeem_free_night(uuid, text, uuid, text) to authenticated;

-- Manually credit nights earned outside this system (Don Mueang stays,
-- which run on a third-party PMS with no feed into this DB). Owner/manager
-- only — staff should not be able to fabricate nights for a friend.
create or replace function public.credit_manual_stay(p_guest_id uuid, p_property text, p_nights int, p_note text default null)
returns table (total_nights_earned int, free_nights_available int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('owner', 'manager')
  ) then
    raise exception 'only owner/manager can manually credit loyalty nights';
  end if;
  if p_property not in ('khaokho', 'donmueang') then
    raise exception 'invalid property: %', p_property;
  end if;
  if p_nights is null or p_nights <= 0 then
    raise exception 'nights must be positive';
  end if;

  insert into public.loyalty_ledger (guest_id, property, event_type, nights_delta, note, created_by)
  values (p_guest_id, p_property, 'night_earned', p_nights, coalesce(p_note, 'manual credit'), auth.uid());

  return query select b.total_nights_earned, b.free_nights_available from public.get_loyalty_balance(p_guest_id) b;
end;
$$;

revoke all on function public.credit_manual_stay(uuid, text, int, text) from public, anon;
grant execute on function public.credit_manual_stay(uuid, text, int, text) to authenticated;

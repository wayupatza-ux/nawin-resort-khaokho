-- Payment control (บอสตอง, 24 Oct 2026). Until now staff keyed every direct
-- booking straight in as "confirmed" and nothing recorded whether the guest
-- actually paid — reconciling against the bank statement found ฿9,000 of
-- staff-confirmed bookings with no money in and ฿5,650 still owed on
-- part-paid ones, yet all of it counted as revenue and 10% commission.
--
-- Rules (staff accounts only — the owner and server-side jobs are exempt,
-- every change is still logged in booking_status_history):
--   * a new direct booking always starts as "pending" (รอชำระ)
--   * pending → confirmed / checked_in needs recorded payments ≥ 50% of the
--     total (a deposit); → checked_out needs the full total
--   * staff can't lower a booking's total_amount (owner only)
--   * payments: staff can add (bank transfer needs a slip) but can't edit,
--     delete or verify them — only the owner verifies
-- Revenue and commission (dashboard/units.html) count owner-verified money.
-- Requires 0021 (status audit actor) to be applied first.

-- ---------- payments ----------

alter table public.payments
  add column if not exists recorded_by uuid references public.profiles(id) default auth.uid(),
  add column if not exists created_at timestamptz not null default now();

-- Transfers must come with a slip. NOT VALID: don't re-check old rows.
alter table public.payments drop constraint if exists payments_transfer_needs_slip;
alter table public.payments
  add constraint payments_transfer_needs_slip
  check (coalesce(method, '') not in ('transfer', 'promptpay') or slip_url is not null) not valid;

drop policy if exists payments_staff_all on public.payments;
drop policy if exists payments_staff_select on public.payments;
drop policy if exists payments_staff_insert on public.payments;
drop policy if exists payments_owner_all on public.payments;

create policy payments_staff_select on public.payments
  for select using (public.is_staff());
create policy payments_staff_insert on public.payments
  for insert with check (
    public.is_staff()
    and verified = false
    and verified_by is null
    and recorded_by = auth.uid()
  );
create policy payments_owner_all on public.payments
  for all using (public.is_owner()) with check (public.is_owner());

-- Staff upload slips from the dashboard (bucket was guest-api/service-role only).
drop policy if exists payment_slips_staff_insert on storage.objects;
create policy payment_slips_staff_insert on storage.objects
  for insert with check (bucket_id = 'payment-slips' and public.is_staff());

-- ---------- per-booking paid amounts ----------

create or replace function public.booking_paid_total(p_booking_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0) from public.payments where booking_id = p_booking_id;
$$;

revoke all on function public.booking_paid_total(uuid) from public, anon;
grant execute on function public.booking_paid_total(uuid) to authenticated;

-- ---------- guard on bookings ----------

create or replace function public.enforce_booking_payment_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid numeric;
begin
  -- Server-side writers (agoda-intake, guest-api, staff-api, pg_cron) run
  -- without a user; the owner may override. Both are still audited by 0021.
  if auth.uid() is null or public.is_owner() then
    return new;
  end if;
  -- OTA bookings are paid through the OTA.
  if new.source in ('agoda', 'booking.com', 'beds24') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status in ('confirmed', 'checked_in', 'checked_out') then
      new.status := 'pending';
    end if;
    return new;
  end if;

  if new.total_amount < old.total_amount then
    raise exception 'ลดยอดเงินการจองได้เฉพาะเจ้าของ (%: % → %)', old.booking_ref, old.total_amount, new.total_amount
      using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status and new.status in ('confirmed', 'checked_in', 'checked_out') then
    v_paid := public.booking_paid_total(new.id);
    if new.status = 'checked_out' and v_paid < new.total_amount then
      raise exception 'เช็คเอาท์ไม่ได้: บันทึกการชำระเงินแล้ว % จากยอด % บาท — บันทึกเงินส่วนที่เหลือก่อน', v_paid, new.total_amount
        using errcode = 'P0001';
    end if;
    if new.status in ('confirmed', 'checked_in') and v_paid < new.total_amount * 0.5 then
      raise exception 'ยืนยันไม่ได้: ยังไม่มีการชำระเงิน (บันทึกแล้ว % จากยอด % บาท ต้องมีมัดจำอย่างน้อย 50%%)', v_paid, new.total_amount
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_booking_payment_rules() from public, anon, authenticated;

drop trigger if exists bookings_enforce_payment_rules on public.bookings;
create trigger bookings_enforce_payment_rules
  before insert or update on public.bookings
  for each row
  execute function public.enforce_booking_payment_rules();

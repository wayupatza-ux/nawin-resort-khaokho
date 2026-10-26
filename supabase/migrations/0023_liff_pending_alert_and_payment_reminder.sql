-- LINE self-bookings (source='liff') start unpaid and are auto-cancelled
-- after 24h. Until now nobody heard about them until they were paid, and
-- the guest got no nudge before the cancel (6L4PFX, 17 Oct 2026, expired
-- unnoticed). บอสตอง asked for:
--   1) an alert to the staff LINE group as soon as a guest books via LINE
--   2) a LINE payment reminder to the guest ~12h in, before the auto-cancel
-- Also: a guest who already uploaded a slip must not be auto-cancelled just
-- because the owner hasn't verified it yet.

-- 1) Staff-group alert: confirmed bookings as before (kind 'confirmed'),
--    plus new LINE bookings while still pending (kind 'liff_pending').
create or replace function public.notify_staff_group_new_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_url text := 'https://espxwmnaoauhsdgckwpr.supabase.co';
  v_secret text := public.get_secret('internal_functions_secret');
  v_kind text;
begin
  if new.status = 'confirmed' then
    v_kind := 'confirmed';
  elsif tg_op = 'INSERT' and new.status = 'pending' and new.source = 'liff' then
    v_kind := 'liff_pending';
  end if;

  if v_kind is not null then
    perform net.http_post(
      url := v_project_url || '/functions/v1/line-group-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', v_secret
      ),
      body := jsonb_build_object('booking_id', new.id, 'kind', v_kind)
    );
  end if;
  return new;
end;
$$;

-- 2) Guest payment reminder, once, between 12h and 23h after booking.
create or replace function public.send_liff_payment_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_url text := 'https://espxwmnaoauhsdgckwpr.supabase.co';
  v_secret text := public.get_secret('internal_functions_secret');
  r record;
begin
  for r in
    select b.id
    from public.bookings b
    where b.source = 'liff'
      and b.status = 'pending'
      and b.created_at < now() - interval '12 hours'
      and b.created_at > now() - interval '23 hours'
      and not exists (select 1 from public.payments p where p.booking_id = b.id)
      and not exists (
        select 1 from public.notifications_log n
        where n.booking_id = b.id and n.channel = 'line' and n.detail like 'payment_reminder%'
      )
  loop
    -- Mark first so the next run (15 min later) can't send a second one.
    insert into public.notifications_log (booking_id, channel, status, detail)
    values (r.id, 'line', 'queued', 'payment_reminder');
    perform net.http_post(
      url := v_project_url || '/functions/v1/line-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', v_secret
      ),
      body := jsonb_build_object('booking_id', r.id, 'kind', 'payment_reminder')
    );
  end loop;
end;
$$;

revoke all on function public.send_liff_payment_reminders() from public, anon, authenticated;

select cron.unschedule('liff-payment-reminder')
  where exists (select 1 from cron.job where jobname = 'liff-payment-reminder');
select cron.schedule(
  'liff-payment-reminder',
  '*/15 * * * *',
  $$select public.send_liff_payment_reminders();$$
);

-- 3) Don't auto-cancel a LINE booking whose guest already sent a slip.
create or replace function public.cancel_expired_pending_bookings()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.actor', 'auto-cancel: LINE booking unpaid 24h', true);
  update public.bookings b
  set status = 'cancelled'
  where b.status = 'pending'
    and b.source = 'liff'
    and b.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.payments p where p.booking_id = b.id);
end;
$$;

revoke all on function public.cancel_expired_pending_bookings() from public, anon, authenticated;

-- Helper to read a Vault secret by name from SECURITY DEFINER contexts
-- (edge functions / triggers), without exposing vault.decrypted_secrets
-- directly to any role.
create or replace function public.get_secret(secret_name text)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name limit 1;
$$;

revoke all on function public.get_secret(text) from public, anon, authenticated;

-- Placeholder secrets — บอสตองต้องอัปเดตค่าจริงหลังสร้าง LINE OA/Login channel/LIFF
-- (ดู HANDOFF.md ขั้นตอนทำเอง). internal_functions_secret ถูกสุ่มและตั้งค่าจริงไว้แล้วใน
-- Vault ของ project (ไม่ได้เก็บค่าจริงในไฟล์นี้ — ใส่ REPLACE_ME แทนไว้เป็นตัวอย่าง
-- สำหรับ apply กับ project ใหม่ในอนาคตเท่านั้น).
select vault.create_secret('REPLACE_ME_LINE_CHANNEL_SECRET', 'line_channel_secret', 'LINE Messaging API channel secret for Nawin Resort Khaokho OA');
select vault.create_secret('REPLACE_ME_LINE_CHANNEL_ACCESS_TOKEN', 'line_channel_access_token', 'LINE Messaging API channel access token');
select vault.create_secret('REPLACE_ME_LINE_LOGIN_CHANNEL_ID', 'line_login_channel_id', 'LINE Login channel ID used to verify LIFF ID tokens');
select vault.create_secret('REPLACE_ME_INTERNAL_FUNCTIONS_SECRET', 'internal_functions_secret', 'Shared secret: notify_booking_confirmed trigger -> line-notify edge function');

-- Trigger: on booking status change to 'confirmed', fire an async HTTP call
-- to the line-notify edge function via pg_net (fire-and-forget, non-blocking).
create or replace function public.notify_booking_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_project_url text := 'https://espxwmnaoauhsdgckwpr.supabase.co';
  v_secret text := public.get_secret('internal_functions_secret');
begin
  if new.status = 'confirmed' and (old.status is distinct from 'confirmed') then
    perform net.http_post(
      url := v_project_url || '/functions/v1/line-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', v_secret
      ),
      body := jsonb_build_object('booking_id', new.id)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_booking_confirmed() from public, anon, authenticated;

create trigger bookings_notify_confirmed
  after update on public.bookings
  for each row
  execute function public.notify_booking_confirmed();

-- Also log every status transition into booking_status_history automatically.
create or replace function public.log_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') or (new.status is distinct from old.status) then
    insert into public.booking_status_history (booking_id, old_status, new_status, changed_by)
    values (new.id, case when tg_op = 'INSERT' then null else old.status end, new.status, auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function public.log_booking_status_change() from public, anon, authenticated;

create trigger bookings_log_status_change
  after insert or update on public.bookings
  for each row
  execute function public.log_booking_status_change();

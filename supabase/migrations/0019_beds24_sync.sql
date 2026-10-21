-- Beds24 channel manager sync (PMS -> Beds24 -> Agoda).
-- Every non-Agoda booking change (walk-in / page / LIFF) is pushed to Beds24 by
-- the beds24-sync edge function, so Beds24 can cut Agoda inventory in real time.
-- Agoda bookings are NOT pushed: Beds24 receives those from Agoda directly.

alter table public.bookings
  add column beds24_booking_id bigint;

create unique index bookings_beds24_booking_id_key
  on public.bookings (beds24_booking_id)
  where beds24_booking_id is not null;

alter table public.units
  add column beds24_room_id integer;

update public.units set beds24_room_id = 746299 where code in ('HOUSE-1', 'HOUSE-2', 'HOUSE-3');
update public.units set beds24_room_id = 746300 where code = 'HOUSE-4';

-- Write/replace a Vault secret. Only the service role (edge functions) may call
-- it; used to store the Beds24 refresh token without it ever passing through SQL
-- typed by a human or an AI session.
create or replace function public.set_secret(secret_name text, secret_value text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = secret_name;
  if v_id is null then
    perform vault.create_secret(secret_value, secret_name);
  else
    perform vault.update_secret(v_id, secret_value);
  end if;
end;
$$;

revoke all on function public.set_secret(text, text) from public, anon, authenticated;
grant execute on function public.set_secret(text, text) to service_role;

-- Fire-and-forget call to beds24-sync whenever a booking that Beds24 should
-- know about is created, moved, resized, repriced or cancelled.
create or replace function public.notify_beds24_sync()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_project_url text := 'https://espxwmnaoauhsdgckwpr.supabase.co';
  v_secret text := public.get_secret('internal_functions_secret');
begin
  if tg_op = 'DELETE' then
    if old.beds24_booking_id is not null then
      perform net.http_post(
        url := v_project_url || '/functions/v1/beds24-sync',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
        body := jsonb_build_object('action', 'cancel', 'beds24_booking_id', old.beds24_booking_id)
      );
    end if;
    return old;
  end if;

  if new.source = 'agoda' and new.beds24_booking_id is null then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.status is distinct from old.status
     or new.check_in is distinct from old.check_in
     or new.check_out is distinct from old.check_out
     or new.unit_id is distinct from old.unit_id
     or new.num_guests is distinct from old.num_guests
     or new.total_amount is distinct from old.total_amount then
    perform net.http_post(
      url := v_project_url || '/functions/v1/beds24-sync',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
      body := jsonb_build_object('action', 'upsert', 'booking_id', new.id)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_beds24_sync() from public, anon, authenticated;

create trigger bookings_beds24_sync
  after insert or update or delete on public.bookings
  for each row
  execute function public.notify_beds24_sync();

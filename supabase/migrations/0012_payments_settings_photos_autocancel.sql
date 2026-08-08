-- Resort-wide settings (PromptPay info etc.) — public read (guest-app needs
-- it to render the payment QR), owner-only write.
create table public.resort_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.resort_settings enable row level security;

create policy resort_settings_select_all on public.resort_settings
  for select using (true);

create policy resort_settings_owner_write on public.resort_settings
  for all using (public.is_owner()) with check (public.is_owner());

insert into public.resort_settings (key, value) values
  ('promptpay_id', ''),
  ('promptpay_name', ''),
  ('payment_note', '');

-- Unit photos (Storage URLs, public bucket).
alter table public.units add column photo_urls text[] not null default '{}';

-- Payment slip verification workflow.
alter table public.payments add column slip_url text;
alter table public.payments add column verified boolean not null default false;
alter table public.payments add column verified_by uuid references public.profiles(id);
alter table public.payments add column verified_at timestamptz;
-- amount was NOT NULL with check (amount > 0) at insert time; a slip upload
-- happens before staff know the exact verified amount, so allow inserting
-- with the booking's total_amount as a placeholder (already required by
-- existing constraint, no schema change needed there).

-- Auto-cancel pending bookings that were never paid within 24h.
create or replace function public.cancel_expired_pending_bookings()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings
  set status = 'cancelled'
  where status = 'pending'
    and created_at < now() - interval '24 hours';
end;
$$;

revoke all on function public.cancel_expired_pending_bookings() from public, anon, authenticated;

create extension if not exists pg_cron;

select cron.schedule(
  'cancel-expired-pending-bookings',
  '*/15 * * * *',
  $$select public.cancel_expired_pending_bookings();$$
);

-- Core schema: units, guests, guest_documents, bookings, booking_status_history,
-- payments, notifications_log, profiles, audit_log
-- Single-property resort (Nawin Resort Khaokho) — no branch/room_type layer,
-- flattened to one `units` table.

create type booking_status as enum (
  'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'
);

create type staff_role as enum ('owner', 'staff');

create table public.units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  unit_type text not null check (unit_type in ('house', 'tent', 'other')),
  base_price numeric not null check (base_price >= 0),
  capacity integer not null check (capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  line_user_id text unique,
  display_name text,
  first_name text,
  last_name text,
  phone text,
  email text,
  nationality text,
  created_at timestamptz not null default now()
);

create table public.guest_documents (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  doc_type text not null,
  doc_number text,
  file_path text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_ref text not null unique,
  guest_id uuid not null references public.guests(id),
  unit_id uuid not null references public.units(id),
  check_in date not null,
  check_out date not null check (check_out > check_in),
  num_guests integer not null default 1 check (num_guests > 0),
  status booking_status not null default 'pending',
  total_amount numeric not null check (total_amount >= 0),
  source text not null default 'liff',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  -- one unit can't be double-booked for overlapping date ranges while
  -- pending/confirmed/checked_in
  exclude using gist (
    unit_id with =,
    daterange(check_in, check_out) with &&
  ) where (status in ('pending', 'confirmed', 'checked_in'))
);

create table public.booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  old_status booking_status,
  new_status booking_status not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  amount numeric not null check (amount > 0),
  method text,
  paid_at timestamptz not null default now(),
  note text
);

create table public.notifications_log (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  channel text not null default 'line',
  status text not null,
  detail text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role staff_role not null default 'staff',
  display_name text,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table public.line_webhook_events (
  id text primary key,
  received_at timestamptz not null default now()
);

create index bookings_unit_dates_idx on public.bookings (unit_id, check_in, check_out);
create index bookings_guest_idx on public.bookings (guest_id);
create index guest_documents_guest_idx on public.guest_documents (guest_id);

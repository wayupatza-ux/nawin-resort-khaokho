-- Support for an OTA (Agoda) booking intake pipeline: an external caller
-- (Hermes reading Agoda's booking-notification emails, or a Zapier/Make
-- webhook) posts parsed reservation data to a new edge function, which
-- needs (a) a stable external ref for idempotency/cancellation lookups and
-- (b) a way to map Agoda's free-text room-type name to one of our units.

alter table public.bookings
  add column external_ref text;

-- one external booking can only ever map to one row per source (e.g. can't
-- have two "agoda" bookings sharing the same Agoda reservation id)
create unique index bookings_source_external_ref_key
  on public.bookings (source, external_ref)
  where external_ref is not null;

alter table public.units
  add column agoda_room_type_name text;

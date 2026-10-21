-- High-season direct prices (บอสตอง, 22 Oct 2026). Direct guests were paying
-- less than we net from Agoda/Booking.com (Deluxe 1,500 weekday vs ~2,300–2,500
-- OTA net). New direct prices sit at or above the OTA net but below what the
-- same guest would pay on Agoda:
--   Deluxe  2,500 Sun–Thu / 3,500 Fri–Sat & holidays / 4,500 long holidays
--   Family  3,500 Sun–Thu / 4,500 Fri–Sat & holidays / 5,500 long holidays
-- Sunday night now counts as a weekday (people drive home on Sunday), matching
-- the Fri–Sat weekend used on the OTAs.

-- Per-night override for one room type (Agoda room type name), checked before
-- the all-units special_night_rates, so long holidays can differ by room type.
create table if not exists public.special_room_type_night_rates (
  night date not null,
  room_type text not null,
  rate numeric not null check (rate > 0),
  note text,
  primary key (night, room_type)
);

alter table public.special_room_type_night_rates enable row level security;

drop policy if exists "special_room_type_night_rates readable" on public.special_room_type_night_rates;
create policy "special_room_type_night_rates readable" on public.special_room_type_night_rates
  for select using (true);

update public.units set weekday_price = 2500, weekend_price = 3500, base_price = 3500
  where agoda_room_type_name = 'Deluxe Bungalow';
update public.units set weekday_price = 3500, weekend_price = 4500, base_price = 4500
  where agoda_room_type_name = 'Family Bungalow';

insert into public.special_room_type_night_rates (night, room_type, rate, note)
select d::date, rt.room_type, rt.rate, 'long holiday — direct high-season price'
from (values
        ('2026-12-05'::date, '2026-12-06'::date),
        ('2026-12-27'::date, '2027-01-02'::date),
        ('2027-02-20'::date, '2027-02-21'::date)
     ) as r(first_night, last_night),
     generate_series(r.first_night, r.last_night, interval '1 day') d,
     (values ('Deluxe Bungalow', 4500), ('Family Bungalow', 5500)) as rt(room_type, rate)
on conflict (night, room_type) do update set rate = excluded.rate, note = excluded.note;

-- Holiday eves that public_holidays (holiday date only) doesn't catch.
insert into public.special_room_type_night_rates (night, room_type, rate, note) values
  ('2026-12-09', 'Deluxe Bungalow', 3500, 'holiday eve (10 Dec) — weekend price'),
  ('2026-12-09', 'Family Bungalow', 4500, 'holiday eve (10 Dec) — weekend price'),
  ('2026-12-24', 'Deluxe Bungalow', 3500, 'Christmas Eve — weekend price'),
  ('2026-12-24', 'Family Bungalow', 4500, 'Christmas Eve — weekend price')
on conflict (night, room_type) do update set rate = excluded.rate, note = excluded.note;

create or replace function public.unit_night_rate(p_unit_id uuid, p_night date)
returns numeric
language plpgsql
stable
as $$
declare
  v_weekday_price numeric;
  v_weekend_price numeric;
  v_base_price numeric;
  v_room_type text;
  v_dow int;
  v_is_holiday boolean;
  v_special numeric;
begin
  select weekday_price, weekend_price, base_price, agoda_room_type_name
    into v_weekday_price, v_weekend_price, v_base_price, v_room_type
    from units where id = p_unit_id;

  select rate into v_special from special_room_type_night_rates
    where night = p_night and room_type = v_room_type;
  if v_special is not null then
    return v_special;
  end if;

  select rate into v_special from special_night_rates where night = p_night;
  if v_special is not null then
    return v_special;
  end if;

  if v_weekday_price is null or v_weekend_price is null then
    return v_base_price;
  end if;
  select exists(select 1 from public_holidays where holiday_date = p_night) into v_is_holiday;
  v_dow := extract(dow from p_night);
  if v_is_holiday or v_dow in (5, 6) then
    return v_weekend_price;
  else
    return v_weekday_price;
  end if;
end;
$$;

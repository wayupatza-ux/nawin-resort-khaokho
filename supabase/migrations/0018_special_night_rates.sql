-- Per-night price override that applies to every unit, used for dates we
-- close on OTAs and sell direct at a higher price. Takes precedence over the
-- weekday/weekend/holiday logic in unit_night_rate().
create table if not exists public.special_night_rates (
  night date primary key,
  rate numeric not null check (rate > 0),
  note text
);

alter table public.special_night_rates enable row level security;

drop policy if exists "special_night_rates readable" on public.special_night_rates;
create policy "special_night_rates readable" on public.special_night_rates
  for select using (true);

insert into public.special_night_rates (night, rate, note) values
  ('2026-11-14', 4500, 'closed on Agoda, direct only'),
  ('2026-12-30', 4500, 'closed on Agoda, direct only'),
  ('2026-12-31', 4500, 'closed on Agoda, direct only'),
  ('2027-01-01', 4500, 'closed on Agoda, direct only'),
  ('2027-01-02', 4500, 'closed on Agoda, direct only')
on conflict (night) do update set rate = excluded.rate, note = excluded.note;

create or replace function public.unit_night_rate(p_unit_id uuid, p_night date)
returns numeric
language plpgsql
stable
as $function$
declare
  v_weekday_price numeric;
  v_weekend_price numeric;
  v_base_price numeric;
  v_dow int;
  v_is_holiday boolean;
  v_special numeric;
begin
  select rate into v_special from special_night_rates where night = p_night;
  if v_special is not null then
    return v_special;
  end if;

  select weekday_price, weekend_price, base_price
    into v_weekday_price, v_weekend_price, v_base_price
    from units where id = p_unit_id;

  if v_weekday_price is null or v_weekend_price is null then
    return v_base_price;
  end if;

  select exists(select 1 from public_holidays where holiday_date = p_night) into v_is_holiday;
  v_dow := extract(dow from p_night);

  if v_is_holiday or v_dow in (0, 5, 6) then
    return v_weekend_price;
  else
    return v_weekday_price;
  end if;
end;
$function$;

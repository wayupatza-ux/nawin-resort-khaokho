-- Placeholder seed for the 3 known unit types (2 houses + 1 tent).
-- Prices/capacity are placeholders — บอสตอง ต้องแก้ราคา/ชื่อจริงใน dashboard
-- ก่อนเปิดให้จองจริง (ดู HANDOFF.md).
insert into public.units (code, name, unit_type, base_price, capacity, is_active) values
  ('HOUSE-1', 'บ้านพัก 1', 'house', 1500, 4, true),
  ('HOUSE-2', 'บ้านพัก 2', 'house', 1500, 4, true),
  ('TENT-1', 'เต็นท์กระโจม', 'tent', 500, 2, true);

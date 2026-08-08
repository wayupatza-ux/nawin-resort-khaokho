-- New role for staff who manage bookings but shouldn't see unit pricing
-- or the revenue report (e.g. front-desk manager). RLS-wise a 'manager'
-- behaves exactly like 'staff' (is_staff() still grants bookings/guests
-- read-write) — the units/reports restriction is enforced by is_owner()
-- already in place (0007/0008) plus the dashboard hiding/redirecting
-- non-owners away from units.html.
alter type staff_role add value 'manager';

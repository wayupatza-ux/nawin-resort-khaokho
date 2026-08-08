-- Only the owner (not generic staff) can add/edit/delete units.
-- Everyone still gets units_select_all (public read for the guest-app booking UI).
create policy units_owner_write on public.units
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

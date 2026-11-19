-- Pacijent vidi aktivni cjenovnik svoje ordinacije, uključujući usluge koje se ugovaraju telefonom.
-- Online zakazivanje i dalje provjerava oznaku online u aplikaciji i funkciji book_appointment.
drop policy if exists services_select on public.services;
create policy services_select on public.services
  for select using (
    public.is_staff(clinic_id)
    or (public.my_role(clinic_id) = 'patient' and is_active)
  );

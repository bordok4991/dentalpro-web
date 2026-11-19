-- Blokade dijele isti vremenski raspored i isto ograničenje preklapanja kao termini.
alter table public.appointments
  add column if not exists is_private_block boolean not null default false,
  alter column patient_id drop not null;

alter table public.appointments drop constraint if exists appointments_private_block_check;
alter table public.appointments add constraint appointments_private_block_check check (
  (not is_private_block and patient_id is not null)
  or (is_private_block and patient_id is null and not booked_online and status in ('zakazan', 'otkazan'))
);

-- Pacijent i ordinacija ostaju nepromjenjivi i za termine bez pacijenta.
create or replace function public.match_appointment_patient()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.patient_id is distinct from old.patient_id or new.clinic_id is distinct from old.clinic_id) then
    raise exception 'Zapis se ne može premjestiti na drugog pacijenta.';
  end if;
  if new.patient_id is not null and not exists (
    select 1 from public.patients where id = new.patient_id and clinic_id = new.clinic_id
  ) then
    raise exception 'Pacijent ne pripada ovoj ordinaciji.';
  end if;
  return new;
end;
$$;
revoke all on function public.match_appointment_patient() from public, anon, authenticated;

drop trigger if exists appointments_match on public.appointments;
create trigger appointments_match before insert or update on public.appointments
  for each row execute function public.match_appointment_patient();

notify pgrst, 'reload schema';

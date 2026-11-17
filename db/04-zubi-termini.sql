-- ============================================================
--  DENTAL PRO — 04 STANJE ZUBA I TERMINI
--  • tooth_status: stanje svakog zuba (cijeli zub i 5 površina)
--  • appointments: kalendar ordinacije, bez preklapanja termina
--    istog doktora
--  Skriptu je sigurno pokrenuti više puta. Pokreće se nakon 03.
-- ============================================================

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------- 1) Stanje zuba ----------

-- Površine: M, O, D, B, L. Vrijednost: karijes, ispun ili plan.
create or replace function public.valid_surfaces(s jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select jsonb_typeof(s) = 'object'
     and not exists (
       select 1 from jsonb_each(s) e
       where e.key not in ('M', 'O', 'D', 'B', 'L')
          or jsonb_typeof(e.value) <> 'string'
          or (e.value #>> '{}') not in ('karijes', 'ispun', 'plan')
     );
$$;

create table if not exists public.tooth_status (
  patient_id  uuid not null references public.patients(id) on delete cascade,
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  tooth       smallint not null check (public.is_fdi_tooth(tooth)),
  condition   text not null default 'zdrav' check (condition in ('zdrav', 'nedostaje', 'krunica', 'implantat')),
  endo        boolean not null default false,
  surfaces    jsonb not null default '{}'::jsonb check (public.valid_surfaces(surfaces)),
  note        text check (note is null or length(note) <= 500),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (patient_id, tooth)
);

drop trigger if exists tooth_status_match on public.tooth_status;
create trigger tooth_status_match
  before insert or update on public.tooth_status
  for each row execute function public.match_patient_clinic();

drop trigger if exists tooth_status_touch on public.tooth_status;
create trigger tooth_status_touch
  before insert or update on public.tooth_status
  for each row execute function public.touch_medical();

drop trigger if exists audit_tooth_status on public.tooth_status;
create trigger audit_tooth_status
  after insert or update or delete on public.tooth_status
  for each row execute function public.audit_row();

alter table public.tooth_status enable row level security;

drop policy if exists tooth_status_select on public.tooth_status;
create policy tooth_status_select on public.tooth_status
  for select using (public.is_clinical(clinic_id));

drop policy if exists tooth_status_insert on public.tooth_status;
create policy tooth_status_insert on public.tooth_status
  for insert with check (public.is_clinical(clinic_id));

drop policy if exists tooth_status_update on public.tooth_status;
create policy tooth_status_update on public.tooth_status
  for update using (public.is_clinical(clinic_id)) with check (public.is_clinical(clinic_id));

revoke all on public.tooth_status from anon;
revoke delete, truncate on public.tooth_status from authenticated;
grant select, insert, update on public.tooth_status to authenticated;

-- ---------- 2) Termini ----------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'appointment_status' and typnamespace = 'public'::regnamespace) then
    create type public.appointment_status as enum
      ('zakazan', 'potvrdjen', 'stigao', 'u_toku', 'zavrsen', 'otkazan', 'nije_dosao');
  end if;
end $$;

create table if not exists public.appointments (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  doctor_id   uuid not null references public.profiles(id),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  service     text not null check (length(trim(service)) between 1 and 120),
  note        text check (note is null or length(note) <= 1000),
  status      public.appointment_status not null default 'zakazan',
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint appointments_time_check check (ends_at > starts_at and ends_at <= starts_at + interval '12 hours'),
  constraint appointments_no_overlap exclude using gist (
    doctor_id extensions.gist_uuid_ops with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status not in ('otkazan', 'nije_dosao'))
);

create index if not exists appointments_clinic_time_idx on public.appointments (clinic_id, starts_at);
create index if not exists appointments_patient_idx on public.appointments (patient_id, starts_at);

-- Doktor mora biti aktivan član ordinacije s kliničkom ulogom.
create or replace function public.check_appointment()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.doctor_id is distinct from old.doctor_id then
    if not exists (
      select 1 from public.clinic_members m
      where m.clinic_id = new.clinic_id and m.user_id = new.doctor_id and m.is_active
        and m.role in ('owner', 'doctor', 'specialist', 'assistant')
    ) then
      raise exception 'Izabrani doktor ne radi u ovoj ordinaciji.';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
      raise exception 'Autor termina se ne može mijenjati.';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_check on public.appointments;
create trigger appointments_check
  before insert or update on public.appointments
  for each row execute function public.check_appointment();

drop trigger if exists appointments_match on public.appointments;
create trigger appointments_match
  before insert or update on public.appointments
  for each row execute function public.match_patient_clinic();

drop trigger if exists audit_appointments on public.appointments;
create trigger audit_appointments
  after insert or update or delete on public.appointments
  for each row execute function public.audit_row();

alter table public.appointments enable row level security;

drop policy if exists appointments_select on public.appointments;
create policy appointments_select on public.appointments
  for select using (public.is_staff(clinic_id));

drop policy if exists appointments_insert on public.appointments;
create policy appointments_insert on public.appointments
  for insert with check (public.is_staff(clinic_id) and created_by = auth.uid());

drop policy if exists appointments_update on public.appointments;
create policy appointments_update on public.appointments
  for update using (public.is_staff(clinic_id)) with check (public.is_staff(clinic_id));

revoke all on public.appointments from anon;
revoke delete, truncate on public.appointments from authenticated;
grant select, insert, update on public.appointments to authenticated;

-- ---------- 3) Dozvole za funkcije ----------
revoke execute on function public.check_appointment() from public, anon, authenticated;
revoke execute on function public.valid_surfaces(jsonb) from public, anon;
grant  execute on function public.valid_surfaces(jsonb) to authenticated;

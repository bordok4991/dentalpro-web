-- ============================================================
--  DENTAL PRO — 03 KARTON PACIJENTA
--  • patients          lični podaci i kontakt (vidi svo osoblje)
--  • patient_medical   alergije, medicinska historija, napomene
--                      (vide samo klinička osoblja, ne recepcija)
--  • patient_entries   zapisi u kartonu: posjete, dijagnoze, zahvati
--                      (samo klinička osoblja; ne brišu se, samo ispravljaju)
--  Pacijenti se ne brišu, nego arhiviraju. Sve izmjene idu u audit log.
--  Skriptu je sigurno pokrenuti više puta. Pokreće se nakon 01 i 02.
-- ============================================================

-- 1) Ko smije vidjeti medicinske podatke
--    Klinička osoblja: vlasnik, doktor, specijalista, asistent.
--    Recepcija vidi lične podatke i kontakt, ali ne i medicinske.
create or replace function public.is_clinical(p_clinic uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_role(p_clinic, array['owner','doctor','specialist','assistant']::public.clinic_role[]);
$$;

-- FDI oznaka zuba: stalni 11–48, mliječni 51–85
create or replace function public.is_fdi_tooth(n smallint)
returns boolean
language sql immutable
set search_path = ''
as $$
  select n is null
      or (n / 10 between 1 and 4 and n % 10 between 1 and 8)
      or (n / 10 between 5 and 8 and n % 10 between 1 and 5);
$$;

-- 2) Brojač kartona po ordinaciji (dodjeljuje ga triger, aplikacija ga ne dira)
create table if not exists public.clinic_counters (
  clinic_id    uuid primary key references public.clinics(id) on delete cascade,
  patient_seq  integer not null default 0
);

-- 3) Pacijenti
create table if not exists public.patients (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete cascade,
  card_number    integer not null,
  first_name     text not null check (length(trim(first_name)) >= 1),
  last_name      text not null check (length(trim(last_name)) >= 1),
  date_of_birth  date check (date_of_birth is null or (date_of_birth <= current_date and date_of_birth >= date '1900-01-01')),
  sex            text check (sex in ('f', 'm')),
  phone          text,
  email          text check (email is null or position('@' in email) > 1),
  address        text,
  city           text,
  is_archived    boolean not null default false,
  created_by     uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (clinic_id, card_number)
);
create index if not exists patients_clinic_name_idx on public.patients (clinic_id, last_name, first_name);

-- 4) Medicinski podaci (jedan red po pacijentu)
create table if not exists public.patient_medical (
  patient_id       uuid primary key references public.patients(id) on delete cascade,
  clinic_id        uuid not null references public.clinics(id) on delete cascade,
  allergies        text,
  medical_history  text,   -- bolesti, terapija, lijekovi
  dental_history   text,   -- prethodni stomatološki tretmani
  notes            text,
  updated_by       uuid references public.profiles(id) on delete set null,
  updated_at       timestamptz not null default now()
);

-- 5) Zapisi u kartonu
create table if not exists public.patient_entries (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  entry_date  date not null default current_date check (entry_date <= current_date + 1),
  tooth       smallint check (public.is_fdi_tooth(tooth)),
  diagnosis   text,
  treatment   text,
  note        text,
  author_id   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (coalesce(trim(diagnosis), '') <> '' or coalesce(trim(treatment), '') <> '' or coalesce(trim(note), '') <> '')
);
create index if not exists patient_entries_patient_idx on public.patient_entries (patient_id, entry_date desc, created_at desc);

-- 6) Trigeri: broj kartona, usklađena ordinacija, vrijeme izmjene
create or replace function public.assign_card_number()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.clinic_counters (clinic_id, patient_seq)
  values (new.clinic_id, 1)
  on conflict (clinic_id) do update set patient_seq = public.clinic_counters.patient_seq + 1
  returning patient_seq into new.card_number;
  return new;
end;
$$;

drop trigger if exists patients_card_number on public.patients;
create trigger patients_card_number
  before insert on public.patients
  for each row execute function public.assign_card_number();

-- Broj kartona, ordinacija i autor se ne mijenjaju naknadno
create or replace function public.lock_patient_identity()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.clinic_id is distinct from old.clinic_id
     or new.card_number is distinct from old.card_number
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Broj kartona i ordinacija pacijenta se ne mogu mijenjati.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists patients_lock_identity on public.patients;
create trigger patients_lock_identity
  before update on public.patients
  for each row execute function public.lock_patient_identity();

-- Medicinski podaci i zapisi moraju pripadati ordinaciji pacijenta
create or replace function public.match_patient_clinic()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.patients where id = new.patient_id and clinic_id = new.clinic_id) then
    raise exception 'Pacijent ne pripada ovoj ordinaciji.';
  end if;
  if tg_op = 'UPDATE' and (new.patient_id is distinct from old.patient_id or new.clinic_id is distinct from old.clinic_id) then
    raise exception 'Zapis se ne može premjestiti na drugog pacijenta.';
  end if;
  return new;
end;
$$;

drop trigger if exists patient_medical_match on public.patient_medical;
create trigger patient_medical_match
  before insert or update on public.patient_medical
  for each row execute function public.match_patient_clinic();

drop trigger if exists patient_entries_match on public.patient_entries;
create trigger patient_entries_match
  before insert or update on public.patient_entries
  for each row execute function public.match_patient_clinic();

create or replace function public.touch_medical()
returns trigger
language plpgsql set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists patient_medical_touch on public.patient_medical;
create trigger patient_medical_touch
  before insert or update on public.patient_medical
  for each row execute function public.touch_medical();

-- Zapis: autor i vrijeme nastanka se ne mijenjaju
create or replace function public.lock_entry_author()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
    raise exception 'Autor zapisa se ne može mijenjati.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists patient_entries_lock on public.patient_entries;
create trigger patient_entries_lock
  before update on public.patient_entries
  for each row execute function public.lock_entry_author();

-- Ključ za pretragu bez kvačica: "begic" nalazi "Begić"
alter table public.patients add column if not exists search_key text;

create or replace function public.patient_search_key()
returns trigger
language plpgsql set search_path = public
as $$
begin
  new.search_key := translate(
    lower(concat_ws(' ', new.first_name, new.last_name, new.phone, new.email)),
    'čćšžđČĆŠŽĐ', 'ccszdccszd');
  return new;
end;
$$;

drop trigger if exists patients_search_key on public.patients;
create trigger patients_search_key
  before insert or update on public.patients
  for each row execute function public.patient_search_key();

update public.patients set first_name = first_name where search_key is null;

-- 7) Audit log
drop trigger if exists audit_patients on public.patients;
create trigger audit_patients
  after insert or update or delete on public.patients
  for each row execute function public.audit_row();

drop trigger if exists audit_patient_medical on public.patient_medical;
create trigger audit_patient_medical
  after insert or update or delete on public.patient_medical
  for each row execute function public.audit_row();

drop trigger if exists audit_patient_entries on public.patient_entries;
create trigger audit_patient_entries
  after insert or update or delete on public.patient_entries
  for each row execute function public.audit_row();

-- audit_row uzima id reda iz kolone "id"; patient_medical ga nema, pa bilježi patient_id
create or replace function public.audit_row()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_clinic  uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;

  if tg_table_name = 'clinics' then
    v_clinic := coalesce(v_new->>'id', v_old->>'id')::uuid;
  else
    v_clinic := coalesce(v_new->>'clinic_id', v_old->>'clinic_id')::uuid;
  end if;

  insert into public.audit_log (clinic_id, actor_id, action, table_name, row_id, old_data, new_data)
  values (v_clinic, auth.uid(), tg_op, tg_table_name,
          coalesce(v_new->>'id', v_old->>'id', v_new->>'patient_id', v_old->>'patient_id'), v_old, v_new);
  return null;
end;
$$;

-- 8) Pravila pristupa
alter table public.clinic_counters  enable row level security;   -- bez pravila: samo triger
alter table public.patients         enable row level security;
alter table public.patient_medical  enable row level security;
alter table public.patient_entries  enable row level security;

-- patients: vidi, dodaje i mijenja svo osoblje (i recepcija); pacijenti i Super Admin ne
-- (administrator platforme ne čita zdravstvene podatke ordinacija)
drop policy if exists patients_select on public.patients;
create policy patients_select on public.patients
  for select using (public.is_staff(clinic_id));

drop policy if exists patients_insert on public.patients;
create policy patients_insert on public.patients
  for insert with check (public.is_staff(clinic_id));

drop policy if exists patients_update on public.patients;
create policy patients_update on public.patients
  for update using (public.is_staff(clinic_id)) with check (public.is_staff(clinic_id));

-- patient_medical: samo klinička osoblja
drop policy if exists patient_medical_select on public.patient_medical;
create policy patient_medical_select on public.patient_medical
  for select using (public.is_clinical(clinic_id));

drop policy if exists patient_medical_insert on public.patient_medical;
create policy patient_medical_insert on public.patient_medical
  for insert with check (public.is_clinical(clinic_id));

drop policy if exists patient_medical_update on public.patient_medical;
create policy patient_medical_update on public.patient_medical
  for update using (public.is_clinical(clinic_id)) with check (public.is_clinical(clinic_id));

-- patient_entries: čitaju i dodaju klinička osoblja; ispravlja autor ili vlasnik
drop policy if exists patient_entries_select on public.patient_entries;
create policy patient_entries_select on public.patient_entries
  for select using (public.is_clinical(clinic_id));

drop policy if exists patient_entries_insert on public.patient_entries;
create policy patient_entries_insert on public.patient_entries
  for insert with check (public.is_clinical(clinic_id) and author_id = auth.uid());

drop policy if exists patient_entries_update on public.patient_entries;
create policy patient_entries_update on public.patient_entries
  for update
  using (public.is_clinical(clinic_id) and (author_id = auth.uid() or public.has_role(clinic_id, array['owner']::public.clinic_role[])))
  with check (public.is_clinical(clinic_id));

-- 9) Dozvole: brisanje nije dozvoljeno ni za koga iz aplikacije
revoke all on public.clinic_counters from anon, authenticated;
revoke all on public.patients        from anon;
revoke all on public.patient_medical from anon;
revoke all on public.patient_entries from anon;
revoke delete, truncate on public.patients, public.patient_medical, public.patient_entries from authenticated;
grant select, insert, update on public.patients, public.patient_medical, public.patient_entries to authenticated;

revoke execute on function public.is_clinical(uuid) from public, anon;
grant  execute on function public.is_clinical(uuid) to authenticated;
revoke execute on function
  public.assign_card_number(),
  public.lock_patient_identity(),
  public.match_patient_clinic(),
  public.touch_medical(),
  public.lock_entry_author(),
  public.patient_search_key(),
  public.audit_row()
from public, anon, authenticated;

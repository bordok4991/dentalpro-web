-- ============================================================
--  DENTAL PRO — 01 TEMELJ (Supabase / PostgreSQL)
--  Ordinacije kao zasebni prostori, uloge, pozivnice, audit log
--  i pravila pristupa (RLS) od prvog dana.
--
--  POKRENI U NOVOM SUPABASE PROJEKTU (ne u Kliktermin projektu).
--  Skriptu je sigurno pokrenuti više puta.
-- ============================================================

-- Zaštita: ne dozvoli pokretanje u Kliktermin bazi
do $$
begin
  if to_regclass('public.businesses') is not null then
    raise exception 'Ovo je Kliktermin projekat. Dental Pro pokreni u NOVOM Supabase projektu.';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1) TIPOVI
-- ------------------------------------------------------------
-- Uloge unutar ordinacije. Sedma uloga (Super Admin) je na nivou
-- platforme i živi u tabeli platform_admins.
do $$ begin
  create type public.clinic_role as enum
    ('owner', 'doctor', 'specialist', 'assistant', 'reception', 'patient');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.clinic_status as enum ('trial', 'active', 'suspended');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2) TABELE
-- ------------------------------------------------------------

-- Profil svakog korisnika (pravi se automatski pri registraciji)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  phone       text,
  locale      text not null default 'bs' check (locale in ('bs', 'hr', 'sr', 'en')),
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- Super Admini platforme. Namjerno odvojena tabela bez pravila za
-- upis: korisnik sam sebi ne može dati ovu ulogu.
create table if not exists public.platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Ordinacija = zaseban prostor (tenant)
create table if not exists public.clinics (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(trim(name)) >= 2),
  doctor_name    text,
  logo_url       text,
  primary_color  text not null default '#0F2A47' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color   text not null default '#14B8A6' check (accent_color  ~ '^#[0-9A-Fa-f]{6}$'),
  address        text,
  city           text,
  country        text not null default 'BA',
  phone          text,
  email          text,
  status         public.clinic_status not null default 'trial',
  trial_ends_at  timestamptz,
  created_at     timestamptz not null default now()
);

-- Članstvo: ko je šta u kojoj ordinaciji.
-- "on delete restrict" na korisniku: nalog koji je član ordinacije
-- ne može se slučajno obrisati (i povući podatke za sobom).
create table if not exists public.clinic_members (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete restrict,
  role        public.clinic_role not null,
  specialty   text,                         -- npr. ortodont, oralni hirurg, implantolog
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (clinic_id, user_id)
);
create index if not exists clinic_members_user_idx on public.clinic_members (user_id);

-- Pozivnice: vlasnik poziva osoblje ili pacijenta emailom
create table if not exists public.clinic_invites (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  email        text not null check (position('@' in email) > 1),
  role         public.clinic_role not null check (role <> 'owner'),
  specialty    text,
  token        uuid not null unique default gen_random_uuid(),
  invited_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  expires_at   timestamptz not null default (now() + interval '14 days'),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists clinic_invites_clinic_idx on public.clinic_invites (clinic_id);

-- Audit log: ko je šta promijenio. Nema pravila za izmjenu/brisanje,
-- pa se zapisi ne mogu mijenjati iz aplikacije. Bez FK na ordinaciju,
-- da zapisi prežive i brisanje ordinacije.
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  clinic_id   uuid,
  actor_id    uuid,
  action      text not null,               -- INSERT / UPDATE / DELETE
  table_name  text not null,
  row_id      text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_clinic_idx on public.audit_log (clinic_id, created_at desc);

-- ------------------------------------------------------------
-- 3) POMOĆNE FUNKCIJE ZA PROVJERU PRISTUPA
--    (security definer: čitaju članstvo bez kruženja kroz RLS)
-- ------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- Moja uloga u datoj ordinaciji (null ako nisam aktivan član)
create or replace function public.my_role(p_clinic uuid)
returns public.clinic_role
language sql stable security definer set search_path = public
as $$
  select role from public.clinic_members
  where clinic_id = p_clinic and user_id = auth.uid() and is_active;
$$;

create or replace function public.has_role(p_clinic uuid, p_roles public.clinic_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.my_role(p_clinic) = any (p_roles), false);
$$;

-- Osoblje = svaka uloga osim pacijenta
create or replace function public.is_staff(p_clinic uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.my_role(p_clinic) <> 'patient', false);
$$;

-- Čiji profil smijem vidjeti: osoblje vidi sve članove svoje ordinacije,
-- pacijent vidi samo osoblje (ne i druge pacijente).
create or replace function public.can_see_profile(p_target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.clinic_members me
    join public.clinic_members t on t.clinic_id = me.clinic_id
    where me.user_id = auth.uid() and me.is_active
      and t.user_id = p_target and t.is_active
      and (me.role <> 'patient' or t.role <> 'patient')
  );
$$;

-- ------------------------------------------------------------
-- 4) AUTOMATSKI PROFIL PRI REGISTRACIJI
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- profili za naloge koji već postoje
insert into public.profiles (id, full_name)
select id, coalesce(raw_user_meta_data->>'full_name', '') from auth.users
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 5) REGISTRACIJA ORDINACIJE
-- ------------------------------------------------------------
-- Interna funkcija (nije dostupna iz aplikacije; koristi je SQL Editor
-- i register_clinic ispod).
create or replace function public.create_clinic_for(
  p_owner        uuid,
  p_name         text,
  p_doctor_name  text default null,
  p_city         text default null,
  p_phone        text default null,
  p_email        text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_owner is null or not exists (select 1 from public.profiles where id = p_owner) then
    raise exception 'Korisnik (vlasnik) ne postoji.';
  end if;

  insert into public.clinics (name, doctor_name, city, phone, email, status, trial_ends_at)
  values (
    trim(p_name),
    nullif(trim(coalesce(p_doctor_name, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    'trial',
    now() + interval '14 days'
  )
  returning id into v_id;

  insert into public.clinic_members (clinic_id, user_id, role)
  values (v_id, p_owner, 'owner');

  return v_id;
end;
$$;

revoke execute on function public.create_clinic_for(uuid, text, text, text, text, text)
  from public, anon, authenticated;

-- Ovo zove aplikacija: prijavljeni korisnik registruje svoju ordinaciju
-- i postaje njen vlasnik, s probnim periodom od 14 dana.
create or replace function public.register_clinic(
  p_name         text,
  p_doctor_name  text default null,
  p_city         text default null,
  p_phone        text default null,
  p_email        text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Morate biti prijavljeni.';
  end if;

  -- jedna probna ordinacija po vlasniku (sprječava zloupotrebu proba)
  if exists (
    select 1
    from public.clinic_members m
    join public.clinics c on c.id = m.clinic_id
    where m.user_id = auth.uid() and m.role = 'owner' and c.status = 'trial'
  ) then
    raise exception 'Već imate ordinaciju u probnom periodu.';
  end if;

  return public.create_clinic_for(auth.uid(), p_name, p_doctor_name, p_city, p_phone, p_email);
end;
$$;

-- ------------------------------------------------------------
-- 6) PRIHVATANJE POZIVNICE
-- ------------------------------------------------------------
create or replace function public.accept_invite(p_token uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_inv    public.clinic_invites;
  v_email  text;
begin
  if auth.uid() is null then
    raise exception 'Morate biti prijavljeni.';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  select * into v_inv from public.clinic_invites where token = p_token for update;
  if not found then
    raise exception 'Pozivnica ne postoji.';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'Pozivnica je već iskorištena.';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'Pozivnica je istekla.';
  end if;
  if lower(v_inv.email) <> lower(coalesce(v_email, '')) then
    raise exception 'Pozivnica je izdana za drugu email adresu.';
  end if;

  insert into public.clinic_members (clinic_id, user_id, role, specialty)
  values (v_inv.clinic_id, auth.uid(), v_inv.role, v_inv.specialty)
  on conflict (clinic_id, user_id)
  do update set role = excluded.role, specialty = excluded.specialty, is_active = true;

  update public.clinic_invites set accepted_at = now() where id = v_inv.id;

  return v_inv.clinic_id;
end;
$$;

-- ------------------------------------------------------------
-- 7) ZAŠTITNI TRIGERI
-- ------------------------------------------------------------

-- Status pretplate i probni period mijenja samo Super Admin
-- (ili SQL Editor / server), nikad vlasnik iz aplikacije.
create or replace function public.protect_clinic_billing()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (new.status is distinct from old.status
      or new.trial_ends_at is distinct from old.trial_ends_at)
     and auth.uid() is not null
     and not public.is_super_admin() then
    raise exception 'Status pretplate može mijenjati samo administrator platforme.';
  end if;
  return new;
end;
$$;

drop trigger if exists clinics_protect_billing on public.clinics;
create trigger clinics_protect_billing
  before update on public.clinics
  for each row execute function public.protect_clinic_billing();

-- Ordinacija ne smije ostati bez aktivnog vlasnika
create or replace function public.ensure_owner_remains()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.role = 'owner' and old.is_active
     and exists (select 1 from public.clinics where id = old.clinic_id)
     and not exists (
       select 1 from public.clinic_members
       where clinic_id = old.clinic_id and role = 'owner' and is_active
     ) then
    raise exception 'Ordinacija mora imati barem jednog aktivnog vlasnika.';
  end if;
  return null;
end;
$$;

-- Članstvo se ne može "preseliti" na drugog korisnika ili drugu ordinaciju
create or replace function public.lock_member_identity()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.clinic_id is distinct from old.clinic_id then
    raise exception 'Korisnik i ordinacija članstva se ne mogu mijenjati.';
  end if;
  return new;
end;
$$;

drop trigger if exists clinic_members_lock_identity on public.clinic_members;
create trigger clinic_members_lock_identity
  before update on public.clinic_members
  for each row execute function public.lock_member_identity();

drop trigger if exists clinic_members_owner_guard on public.clinic_members;
create trigger clinic_members_owner_guard
  after update or delete on public.clinic_members
  for each row execute function public.ensure_owner_remains();

-- ------------------------------------------------------------
-- 8) AUDIT LOG TRIGER (isti triger kačimo na svaku novu tabelu)
-- ------------------------------------------------------------
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
          coalesce(v_new->>'id', v_old->>'id'), v_old, v_new);
  return null;
end;
$$;

drop trigger if exists audit_clinics on public.clinics;
create trigger audit_clinics
  after insert or update or delete on public.clinics
  for each row execute function public.audit_row();

drop trigger if exists audit_clinic_members on public.clinic_members;
create trigger audit_clinic_members
  after insert or update or delete on public.clinic_members
  for each row execute function public.audit_row();

drop trigger if exists audit_clinic_invites on public.clinic_invites;
create trigger audit_clinic_invites
  after insert or update or delete on public.clinic_invites
  for each row execute function public.audit_row();

-- ------------------------------------------------------------
-- 9) PRAVILA PRISTUPA (RLS) — uključena na SVIM tabelama
-- ------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.platform_admins  enable row level security;
alter table public.clinics          enable row level security;
alter table public.clinic_members   enable row level security;
alter table public.clinic_invites   enable row level security;
alter table public.audit_log        enable row level security;

-- profiles: svoj profil, profili iz moje ordinacije, Super Admin sve
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid() or public.is_super_admin() or public.can_see_profile(id)
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- platform_admins: mogu samo vidjeti jesam li ja admin (upis: samo SQL Editor)
drop policy if exists platform_admins_select_own on public.platform_admins;
create policy platform_admins_select_own on public.platform_admins
  for select using (user_id = auth.uid());

-- clinics: vide članovi; mijenja vlasnik; kreiranje ide kroz register_clinic
drop policy if exists clinics_select on public.clinics;
create policy clinics_select on public.clinics
  for select using (public.my_role(id) is not null or public.is_super_admin());

drop policy if exists clinics_update on public.clinics;
create policy clinics_update on public.clinics
  for update
  using      (public.has_role(id, array['owner']::public.clinic_role[]) or public.is_super_admin())
  with check (public.has_role(id, array['owner']::public.clinic_role[]) or public.is_super_admin());

-- clinic_members: osoblje vidi tim; svako vidi svoje članstvo; upravlja vlasnik
drop policy if exists clinic_members_select on public.clinic_members;
create policy clinic_members_select on public.clinic_members
  for select using (
    user_id = auth.uid() or public.is_staff(clinic_id) or public.is_super_admin()
  );

-- Namjerno NEMA pravila za INSERT: član se dodaje samo kroz pozivnicu
-- (accept_invite) ili registraciju ordinacije. Tako vlasnik ne može
-- "učlaniti" tuđi nalog i time doći do njegovih podataka.
drop policy if exists clinic_members_manage on public.clinic_members;
drop policy if exists clinic_members_update on public.clinic_members;
create policy clinic_members_update on public.clinic_members
  for update
  using      (public.has_role(clinic_id, array['owner']::public.clinic_role[]) or public.is_super_admin())
  with check (public.has_role(clinic_id, array['owner']::public.clinic_role[]) or public.is_super_admin());

drop policy if exists clinic_members_delete on public.clinic_members;
create policy clinic_members_delete on public.clinic_members
  for delete
  using (public.has_role(clinic_id, array['owner']::public.clinic_role[]) or public.is_super_admin());

-- clinic_invites: samo vlasnik (prihvatanje ide kroz accept_invite)
drop policy if exists clinic_invites_manage on public.clinic_invites;
create policy clinic_invites_manage on public.clinic_invites
  for all
  using      (public.has_role(clinic_id, array['owner']::public.clinic_role[]) or public.is_super_admin())
  with check (public.has_role(clinic_id, array['owner']::public.clinic_role[]) or public.is_super_admin());

-- audit_log: čita vlasnik svoje ordinacije i Super Admin; niko ne mijenja
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select using (
    public.has_role(clinic_id, array['owner']::public.clinic_role[]) or public.is_super_admin()
  );

-- ------------------------------------------------------------
-- 10) UČVRŠĆIVANJE DOZVOLA
--     Aplikacija nema anonimni pristup podacima: sve ide kroz
--     prijavljenog korisnika i pravila iznad.
-- ------------------------------------------------------------
alter function public.lock_member_identity() set search_path = public;

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

-- Trigger funkcije niko ne zove direktno
revoke execute on function
  public.handle_new_user(),
  public.audit_row(),
  public.protect_clinic_billing(),
  public.ensure_owner_remains(),
  public.lock_member_identity()
from authenticated;

-- Prijavljeni korisnik smije zvati samo ovo:
-- provjere koje koriste pravila pristupa + dvije radnje iz aplikacije
grant execute on function
  public.is_super_admin(),
  public.my_role(uuid),
  public.has_role(uuid, public.clinic_role[]),
  public.is_staff(uuid),
  public.can_see_profile(uuid),
  public.register_clinic(text, text, text, text, text),
  public.accept_invite(uuid)
to authenticated;

-- Isto važi i za sve što se ubuduće doda u public
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- ============================================================
--  NAKON POKRETANJA (ručno, jednom) — skini "--" i upiši svoje podatke
-- ============================================================
-- A) Postavi sebe za Super Admina (prvo napravi nalog u Authentication → Users):
-- insert into public.platform_admins (user_id)
-- select id from auth.users where email = 'TVOJ@EMAIL.com';

-- B) Napravi pilot ordinaciju za nalog vlasnice/vlasnika:
-- select public.create_clinic_for(
--   (select id from auth.users where email = 'EMAIL-VLASNIKA@EMAIL.com'),
--   'N Dental Aesthetic',
--   'dr Ime Prezime',
--   'Grad'
-- );

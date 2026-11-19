-- ============================================================
--  DENTAL PRO — 07 O DOKTORU I ORDINACIJI
--  • profil doktora: veća slika, kratka biografija, obrazovanje
--    i edukacije (jedna stavka po redu)
--  • ordinacija: opis i slika prostora
--  • clinic_doctors vraća i biografiju, obrazovanje i veću sliku,
--    da ih pacijent vidi u aplikaciji
--  Skriptu je sigurno pokrenuti više puta. Pokreće se nakon 06.
-- ============================================================

-- ---------- 1) Profil doktora ----------
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists education text;
alter table public.profiles add column if not exists photo_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_about_check') then
    alter table public.profiles add constraint profiles_about_check check (
      (bio is null or length(bio) <= 1500)
      and (education is null or length(education) <= 2000)
      and (photo_url is null or length(photo_url) <= 300000)
    );
  end if;
end $$;

-- Svoj profil korisnik mijenja sam (kao ime, telefon i sliku)
grant update (bio, education, photo_url) on public.profiles to authenticated;

-- ---------- 2) Ordinacija ----------
alter table public.clinics add column if not exists about text;
alter table public.clinics add column if not exists cover_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clinics_about_check') then
    alter table public.clinics add constraint clinics_about_check check (
      (about is null or length(about) <= 2000)
      and (cover_url is null or length(cover_url) <= 300000)
    );
  end if;
end $$;

-- ---------- 3) Doktori ordinacije za pacijente ----------
drop function if exists public.clinic_doctors(uuid);
create function public.clinic_doctors(p_clinic uuid)
returns table (user_id uuid, full_name text, avatar_url text, specialty text, role public.clinic_role,
               bio text, education text, photo_url text)
language sql stable security definer set search_path = public
as $$
  select m.user_id, p.full_name, p.avatar_url, m.specialty, m.role, p.bio, p.education, p.photo_url
  from public.clinic_members m
  join public.profiles p on p.id = m.user_id
  where m.clinic_id = p_clinic and m.is_active and m.role in ('owner', 'doctor', 'specialist')
    and public.my_role(p_clinic) is not null
  order by case m.role when 'owner' then 0 else 1 end, p.full_name;
$$;

revoke execute on function public.clinic_doctors(uuid) from public, anon;
grant  execute on function public.clinic_doctors(uuid) to authenticated;

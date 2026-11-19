-- ============================================================
--  DENTAL PRO — 08 SLIKA DIPLOMA I CERTIFIKATA
--  • profil doktora: posebna slika diploma i certifikata,
--    prikazuje se uz obrazovanje i edukacije
--  Skriptu je sigurno pokrenuti više puta. Pokreće se nakon 07.
-- ============================================================

alter table public.profiles add column if not exists credentials_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_credentials_check') then
    alter table public.profiles add constraint profiles_credentials_check
      check (credentials_url is null or length(credentials_url) <= 300000);
  end if;
end $$;

grant update (credentials_url) on public.profiles to authenticated;

drop function if exists public.clinic_doctors(uuid);
create function public.clinic_doctors(p_clinic uuid)
returns table (user_id uuid, full_name text, avatar_url text, specialty text, role public.clinic_role,
               bio text, education text, photo_url text, credentials_url text)
language sql stable security definer set search_path = public
as $$
  select m.user_id, p.full_name, p.avatar_url, m.specialty, m.role, p.bio, p.education, p.photo_url, p.credentials_url
  from public.clinic_members m
  join public.profiles p on p.id = m.user_id
  where m.clinic_id = p_clinic and m.is_active and m.role in ('owner', 'doctor', 'specialist')
    and public.my_role(p_clinic) is not null
  order by case m.role when 'owner' then 0 else 1 end, p.full_name;
$$;

revoke execute on function public.clinic_doctors(uuid) from public, anon;
grant  execute on function public.clinic_doctors(uuid) to authenticated;

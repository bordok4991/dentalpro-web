-- ============================================================
--  DENTAL PRO — 02 PROFILI (dopuna za ekran "Tim")
--  • email u profilu, uvijek jednak emailu naloga
--  • korisnik može mijenjati samo ime, telefon, jezik i sliku
--  • pacijent vidi samo svoj profil (ne i podatke osoblja)
--  Skriptu je sigurno pokrenuti više puta. Pokreće se nakon 01.
-- ============================================================

-- 1) Email u profilu
alter table public.profiles add column if not exists email text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Kad korisnik promijeni email naloga, profil ga prati
create or replace function public.sync_profile_email()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email();

-- postojeći nalozi
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

-- 2) Korisnik ne može sam upisati tuđi email u svoj profil:
--    izmjena je dozvoljena samo na ovim kolonama.
revoke update on public.profiles from authenticated;
grant  update (full_name, phone, locale, avatar_url) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated;

-- 3) Profile drugih članova vidi samo osoblje ordinacije.
--    Pacijent vidi isključivo svoj profil.
create or replace function public.can_see_profile(p_target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.clinic_members me
    join public.clinic_members t on t.clinic_id = me.clinic_id
    where me.user_id = auth.uid() and me.is_active and me.role <> 'patient'
      and t.user_id = p_target
  );
$$;

-- 4) Dozvole za novu funkciju
revoke execute on function public.sync_profile_email() from public, anon, authenticated;
revoke execute on function public.handle_new_user()    from public, anon, authenticated;

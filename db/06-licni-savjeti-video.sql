-- ============================================================
--  DENTAL PRO — 06 LIČNI SAVJETI I PORUKE, VIDEO U SAVJETIMA
--  • patient_messages: savjet ili poruka doktora jednom pacijentu;
--    vidi je samo taj pacijent i kliničko osoblje
--  • video_url: link na video (npr. YouTube) u opštim objavama
--    i u ličnim savjetima
--  Skriptu je sigurno pokrenuti više puta. Pokreće se nakon 05.
-- ============================================================

-- ---------- 1) Video u opštim objavama ----------
alter table public.clinic_posts add column if not exists video_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clinic_posts_video_check') then
    alter table public.clinic_posts add constraint clinic_posts_video_check
      check (video_url is null or (length(video_url) <= 300 and video_url ~ '^https://'));
  end if;
end $$;

-- ---------- 2) Lični savjeti i poruke ----------
create table if not exists public.patient_messages (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  kind        text not null default 'savjet' check (kind in ('savjet', 'poruka')),
  title       text not null check (length(trim(title)) between 1 and 140),
  body        text not null check (length(trim(body)) between 1 and 8000),
  video_url   text check (video_url is null or (length(video_url) <= 300 and video_url ~ '^https://')),
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists patient_messages_patient_idx on public.patient_messages (patient_id, created_at desc);

-- Poslana poruka se ne mijenja; jedino se bilježi kad ju je pacijent pročitao
create or replace function public.check_patient_message()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.read_at := null;
    return new;
  end if;
  if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
    raise exception 'Poslana poruka se ne mijenja.';
  end if;
  return new;
end;
$$;

drop trigger if exists patient_messages_check on public.patient_messages;
create trigger patient_messages_check
  before insert or update on public.patient_messages
  for each row execute function public.check_patient_message();

drop trigger if exists patient_messages_match on public.patient_messages;
create trigger patient_messages_match
  before insert or update on public.patient_messages
  for each row execute function public.match_patient_clinic();

drop trigger if exists audit_patient_messages on public.patient_messages;
create trigger audit_patient_messages
  after insert or update or delete on public.patient_messages
  for each row execute function public.audit_row();

alter table public.patient_messages enable row level security;

-- Vidi ih kliničko osoblje i pacijent kome su poslane
drop policy if exists patient_messages_select on public.patient_messages;
create policy patient_messages_select on public.patient_messages
  for select using (public.is_clinical(clinic_id) or public.is_my_patient(patient_id));

drop policy if exists patient_messages_insert on public.patient_messages;
create policy patient_messages_insert on public.patient_messages
  for insert with check (public.is_clinical(clinic_id) and created_by = auth.uid());

-- Povući poruku može vlasnik ili onaj ko ju je poslao
drop policy if exists patient_messages_delete on public.patient_messages;
create policy patient_messages_delete on public.patient_messages
  for delete using (
    public.has_role(clinic_id, array['owner']::public.clinic_role[])
    or (created_by = auth.uid() and public.is_clinical(clinic_id))
  );

revoke all on public.patient_messages from anon;
revoke update, truncate on public.patient_messages from authenticated;
grant select, insert, delete on public.patient_messages to authenticated;

-- Pacijent označava svoju poruku pročitanom
create or replace function public.mark_message_read(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  m public.patient_messages;
begin
  select * into m from public.patient_messages where id = p_id;
  if not found or not public.is_my_patient(m.patient_id) then
    raise exception 'Poruka ne postoji.';
  end if;
  if m.read_at is null then
    update public.patient_messages set read_at = now() where id = p_id;
  end if;
end;
$$;

-- ---------- 3) Dozvole za funkcije ----------
revoke execute on function public.check_patient_message() from public, anon, authenticated;
revoke execute on function public.mark_message_read(uuid) from public, anon;
grant  execute on function public.mark_message_read(uuid) to authenticated;

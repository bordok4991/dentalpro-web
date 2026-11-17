-- ============================================================
--  DENTAL PRO — 05 CJENOVNIK, PLANOVI TERAPIJE, UPLATE, OBJAVE
--                I APLIKACIJA ZA PACIJENTE
--  • services          cjenovnik ordinacije
--  • treatment_plans   plan terapije / ponuda (nacrt → poslan →
--    plan_items        prihvaćen ili odbijen → završen)
--  • payments          uplate (ne brišu se, samo storniraju)
--  • clinic_posts      novosti (popusti, najave) i savjeti doktora
--  • pacijentski nalog: karton se veže za nalog pacijenta kroz
--    pozivnicu; pacijent vidi samo svoje podatke
--  • online zakazivanje u radnom vremenu ordinacije
--  • slike (logo, slika doktora, slike objava) u Supabase Storage
--  Skriptu je sigurno pokrenuti više puta. Pokreće se nakon 04.
-- ============================================================

-- ---------- 0) Pomoćne funkcije ----------

create or replace function public.try_uuid(p text)
returns uuid
language plpgsql immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- Radno vrijeme: {"1": ["08:00", "16:00"], ...}; ključ je dan u sedmici (0 = nedjelja)
create or replace function public.valid_hours(h jsonb)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  e record;
begin
  if h is null or jsonb_typeof(h) <> 'object' then
    return false;
  end if;
  for e in select key, value from jsonb_each(h) loop
    if e.key not in ('0', '1', '2', '3', '4', '5', '6') then return false; end if;
    if jsonb_typeof(e.value) <> 'array' then return false; end if;
    if jsonb_array_length(e.value) <> 2 then return false; end if;
    if coalesce(e.value->>0, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    if coalesce(e.value->>1, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    if (e.value->>0) >= (e.value->>1) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.is_timezone(p text)
returns boolean
language plpgsql stable
set search_path = ''
as $$
begin
  perform now() at time zone p;
  return p is not null;
exception when others then
  return false;
end;
$$;

-- Zajednički triger: vrijeme izmjene; ordinacija i autor se ne mijenjaju
create or replace function public.touch_row()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.clinic_id is distinct from old.clinic_id then
      raise exception 'Zapis se ne može premjestiti u drugu ordinaciju.';
    end if;
    if (to_jsonb(new)->'created_by') is distinct from (to_jsonb(old)->'created_by')
       or (to_jsonb(new)->'created_at') is distinct from (to_jsonb(old)->'created_at') then
      raise exception 'Autor zapisa se ne može mijenjati.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- 1) Postavke ordinacije ----------

alter table public.clinics add column if not exists timezone text not null default 'Europe/Sarajevo';
alter table public.clinics add column if not exists currency text not null default 'KM';
alter table public.clinics add column if not exists online_booking boolean not null default false;
alter table public.clinics add column if not exists working_hours jsonb not null
  default '{"1":["08:00","16:00"],"2":["08:00","16:00"],"3":["08:00","16:00"],"4":["08:00","16:00"],"5":["08:00","16:00"]}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clinics_hours_check') then
    alter table public.clinics add constraint clinics_hours_check check (public.valid_hours(working_hours));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clinics_currency_check') then
    alter table public.clinics add constraint clinics_currency_check check (currency in ('KM', 'EUR', 'RSD'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clinics_timezone_check') then
    alter table public.clinics add constraint clinics_timezone_check check (public.is_timezone(timezone));
  end if;
end $$;

-- ---------- 2) Cjenovnik ----------

create table if not exists public.services (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 120),
  price         numeric(10,2) not null default 0 check (price >= 0 and price <= 1000000),
  duration_min  smallint not null default 30 check (duration_min between 5 and 480),
  is_active     boolean not null default true,
  online        boolean not null default true,   -- pacijent je vidi i može je sam zakazati
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists services_clinic_name_idx on public.services (clinic_id, lower(trim(name)));

drop trigger if exists services_touch on public.services;
create trigger services_touch
  before update on public.services
  for each row execute function public.touch_row();

drop trigger if exists audit_services on public.services;
create trigger audit_services
  after insert or update or delete on public.services
  for each row execute function public.audit_row();

alter table public.services enable row level security;

-- Osoblje vidi cijeli cjenovnik; pacijent samo aktivne usluge za online zakazivanje
drop policy if exists services_select on public.services;
create policy services_select on public.services
  for select using (
    public.is_staff(clinic_id)
    or (public.my_role(clinic_id) = 'patient' and is_active and online)
  );

drop policy if exists services_insert on public.services;
create policy services_insert on public.services
  for insert with check (public.has_role(clinic_id, array['owner']::public.clinic_role[]));

drop policy if exists services_update on public.services;
create policy services_update on public.services
  for update
  using      (public.has_role(clinic_id, array['owner']::public.clinic_role[]))
  with check (public.has_role(clinic_id, array['owner']::public.clinic_role[]));

revoke all on public.services from anon;
revoke delete, truncate on public.services from authenticated;
grant select, insert, update on public.services to authenticated;

-- ---------- 3) Pacijentski nalog ----------

alter table public.patients add column if not exists user_id uuid references public.profiles(id) on delete set null;
create unique index if not exists patients_clinic_user_idx on public.patients (clinic_id, user_id) where user_id is not null;

alter table public.clinic_invites add column if not exists patient_id uuid references public.patients(id) on delete cascade;

-- Nalog se veže za karton samo kroz pozivnicu (accept_invite), nikad direktno iz aplikacije
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
  if new.user_id is distinct from old.user_id and current_user in ('authenticated', 'anon') then
    raise exception 'Nalog pacijenta se povezuje samo pozivnicom.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Ja sam ovaj pacijent (aktivan pacijentski nalog povezan s kartonom)
create or replace function public.is_my_patient(p_patient uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.patients p
    join public.clinic_members m on m.clinic_id = p.clinic_id and m.user_id = p.user_id
    where p.id = p_patient and p.user_id = auth.uid() and m.is_active and m.role = 'patient'
  );
$$;

drop policy if exists patients_select on public.patients;
create policy patients_select on public.patients
  for select using (
    public.is_staff(clinic_id)
    or (user_id = auth.uid() and public.my_role(clinic_id) = 'patient')
  );

drop policy if exists patients_insert on public.patients;
create policy patients_insert on public.patients
  for insert with check (public.is_staff(clinic_id) and user_id is null);

-- Pozivnica za pacijenta mora biti vezana za karton iste ordinacije
create or replace function public.check_invite()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.patient_id is not null then
    if new.role <> 'patient' then
      raise exception 'Pozivnica za karton može biti samo pacijentska.';
    end if;
    if not exists (select 1 from public.patients where id = new.patient_id and clinic_id = new.clinic_id) then
      raise exception 'Pacijent ne pripada ovoj ordinaciji.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists clinic_invites_check on public.clinic_invites;
create trigger clinic_invites_check
  before insert or update on public.clinic_invites
  for each row execute function public.check_invite();

-- Osoblje (i recepcija) poziva pacijenta iz kartona
drop policy if exists clinic_invites_patient_select on public.clinic_invites;
create policy clinic_invites_patient_select on public.clinic_invites
  for select using (role = 'patient' and patient_id is not null and public.is_staff(clinic_id));

drop policy if exists clinic_invites_patient_insert on public.clinic_invites;
create policy clinic_invites_patient_insert on public.clinic_invites
  for insert with check (
    role = 'patient' and patient_id is not null and public.is_staff(clinic_id) and invited_by = auth.uid()
  );

drop policy if exists clinic_invites_patient_delete on public.clinic_invites;
create policy clinic_invites_patient_delete on public.clinic_invites
  for delete using (
    role = 'patient' and patient_id is not null and accepted_at is null and public.is_staff(clinic_id)
  );

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

  -- Član osoblja ne postaje pacijent iste ordinacije (izgubio bi svoju ulogu)
  if v_inv.role = 'patient' and exists (
    select 1 from public.clinic_members
    where clinic_id = v_inv.clinic_id and user_id = auth.uid() and role <> 'patient'
  ) then
    raise exception 'Ovaj nalog već radi u ordinaciji. Za pacijentski pristup koristite drugu email adresu.';
  end if;

  if v_inv.patient_id is not null then
    if exists (
      select 1 from public.patients
      where clinic_id = v_inv.clinic_id and user_id = auth.uid() and id <> v_inv.patient_id
    ) then
      raise exception 'Vaš nalog je već povezan s drugim kartonom u ovoj ordinaciji.';
    end if;
    update public.patients set user_id = auth.uid()
    where id = v_inv.patient_id and clinic_id = v_inv.clinic_id
      and (user_id is null or user_id = auth.uid());
    if not found then
      raise exception 'Karton je već povezan s drugim nalogom.';
    end if;
  end if;

  insert into public.clinic_members (clinic_id, user_id, role, specialty)
  values (v_inv.clinic_id, auth.uid(), v_inv.role, v_inv.specialty)
  on conflict (clinic_id, user_id)
  do update set role = excluded.role, specialty = excluded.specialty, is_active = true;

  update public.clinic_invites set accepted_at = now() where id = v_inv.id;

  return v_inv.clinic_id;
end;
$$;

-- Osoblje ukida pacijentu pristup aplikaciji (karton ostaje)
create or replace function public.unlink_patient_account(p_patient uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v public.patients;
begin
  select * into v from public.patients where id = p_patient;
  if not found or not public.is_staff(v.clinic_id) then
    raise exception 'Nemate pravo na ovu radnju.';
  end if;
  if v.user_id is null then
    return;
  end if;
  update public.clinic_members set is_active = false
  where clinic_id = v.clinic_id and user_id = v.user_id and role = 'patient';
  update public.patients set user_id = null where id = p_patient;
end;
$$;

-- ---------- 4) Plan terapije i ponuda ----------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_status' and typnamespace = 'public'::regnamespace) then
    create type public.plan_status as enum ('nacrt', 'poslan', 'prihvacen', 'odbijen', 'zavrsen');
  end if;
end $$;

create table if not exists public.treatment_plans (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  patient_id    uuid not null references public.patients(id) on delete cascade,
  title         text not null check (length(trim(title)) between 1 and 120),
  note          text check (note is null or length(note) <= 2000),
  discount_pct  numeric(5,2) not null default 0 check (discount_pct >= 0 and discount_pct <= 100),
  valid_until   date,
  status        public.plan_status not null default 'nacrt',
  created_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  sent_at       timestamptz,
  responded_at  timestamptz,
  responded_by  uuid references public.profiles(id) on delete set null
);
create index if not exists treatment_plans_patient_idx on public.treatment_plans (patient_id, created_at desc);
create index if not exists treatment_plans_clinic_idx on public.treatment_plans (clinic_id, status);

create table if not exists public.plan_items (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references public.treatment_plans(id) on delete cascade,
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  service_id   uuid references public.services(id) on delete set null,
  tooth        smallint check (public.is_fdi_tooth(tooth)),
  description  text not null check (length(trim(description)) between 1 and 200),
  unit_price   numeric(10,2) not null check (unit_price >= 0 and unit_price <= 1000000),
  qty          smallint not null default 1 check (qty between 1 and 32),
  position     integer not null default 0,
  done_at      timestamptz,
  done_by      uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists plan_items_plan_idx on public.plan_items (plan_id, position, created_at);
create index if not exists plan_items_patient_idx on public.plan_items (patient_id) where done_at is not null;

-- Prelazi statusa plana; vremena slanja i odgovora upisuje baza
create or replace function public.check_plan()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'nacrt' then
      raise exception 'Novi plan počinje kao nacrt.';
    end if;
    new.sent_at := null;
    new.responded_at := null;
    new.responded_by := null;
    return new;
  end if;

  if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'Autor plana se ne može mijenjati.';
  end if;
  new.sent_at := old.sent_at;
  new.responded_at := old.responded_at;
  new.responded_by := old.responded_by;

  if old.status in ('prihvacen', 'zavrsen') and new.discount_pct is distinct from old.discount_pct then
    raise exception 'Prihvaćeni plan se ne može mijenjati. Napravite novi plan.';
  end if;

  if new.status is distinct from old.status then
    if not (
         (old.status = 'nacrt'     and new.status in ('poslan', 'prihvacen'))
      or (old.status = 'poslan'    and new.status in ('nacrt', 'prihvacen', 'odbijen'))
      or (old.status = 'prihvacen' and new.status = 'zavrsen')
      or (old.status = 'zavrsen'   and new.status = 'prihvacen')
      or (old.status = 'odbijen'   and new.status = 'nacrt')
    ) then
      raise exception 'Plan ne može preći iz statusa % u %.', old.status, new.status;
    end if;
    if new.status in ('poslan', 'prihvacen') and old.status in ('nacrt', 'poslan')
       and not exists (select 1 from public.plan_items where plan_id = new.id) then
      raise exception 'Plan nema nijednu stavku.';
    end if;
    if new.status = 'poslan' then
      new.sent_at := now();
    elsif new.status in ('prihvacen', 'odbijen') and old.status in ('nacrt', 'poslan') then
      new.responded_at := now();
      new.responded_by := auth.uid();
    elsif new.status = 'nacrt' then
      new.sent_at := null;
      new.responded_at := null;
      new.responded_by := null;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists treatment_plans_check on public.treatment_plans;
create trigger treatment_plans_check
  before insert or update on public.treatment_plans
  for each row execute function public.check_plan();

drop trigger if exists treatment_plans_match on public.treatment_plans;
create trigger treatment_plans_match
  before insert or update on public.treatment_plans
  for each row execute function public.match_patient_clinic();

drop trigger if exists audit_treatment_plans on public.treatment_plans;
create trigger audit_treatment_plans
  after insert or update or delete on public.treatment_plans
  for each row execute function public.audit_row();

-- Stavke se mijenjaju samo dok je plan nacrt; urađenim se označavaju kad je plan prihvaćen.
-- (Brisanje stavke ograničava pravilo pristupa ispod.)
create or replace function public.check_plan_item()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_plan public.treatment_plans;
begin
  select * into v_plan from public.treatment_plans where id = new.plan_id;
  if not found or v_plan.clinic_id <> new.clinic_id or v_plan.patient_id <> new.patient_id then
    raise exception 'Stavka ne pripada ovom planu.';
  end if;
  if new.service_id is not null
     and not exists (select 1 from public.services where id = new.service_id and clinic_id = new.clinic_id) then
    raise exception 'Usluga nije iz cjenovnika ove ordinacije.';
  end if;

  if tg_op = 'INSERT' then
    if v_plan.status <> 'nacrt' then
      raise exception 'Stavke se mogu mijenjati samo dok je plan nacrt.';
    end if;
    new.done_at := null;
    new.done_by := null;
    return new;
  end if;

  if new.plan_id is distinct from old.plan_id then
    raise exception 'Stavka se ne može premjestiti u drugi plan.';
  end if;
  if (new.description, new.unit_price, new.qty, new.tooth, new.service_id)
     is distinct from (old.description, old.unit_price, old.qty, old.tooth, old.service_id) then
    if v_plan.status <> 'nacrt' then
      raise exception 'Stavke se mogu mijenjati samo dok je plan nacrt.';
    end if;
  end if;
  if new.done_at is distinct from old.done_at then
    if v_plan.status <> 'prihvacen' then
      raise exception 'Urađenim se označava stavka prihvaćenog plana.';
    end if;
    if new.done_at is not null then
      new.done_at := now();
      new.done_by := auth.uid();
    else
      new.done_by := null;
    end if;
  else
    new.done_by := old.done_by;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists plan_items_check on public.plan_items;
create trigger plan_items_check
  before insert or update on public.plan_items
  for each row execute function public.check_plan_item();

drop trigger if exists audit_plan_items on public.plan_items;
create trigger audit_plan_items
  after insert or update or delete on public.plan_items
  for each row execute function public.audit_row();

-- Pacijent vidi plan kad mu je poslan (nacrte ne vidi)
create or replace function public.plan_visible_to_me(p_plan uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.treatment_plans
    where id = p_plan and status <> 'nacrt' and public.is_my_patient(patient_id)
  );
$$;

alter table public.treatment_plans enable row level security;
alter table public.plan_items enable row level security;

drop policy if exists treatment_plans_select on public.treatment_plans;
create policy treatment_plans_select on public.treatment_plans
  for select using (
    public.is_staff(clinic_id) or (status <> 'nacrt' and public.is_my_patient(patient_id))
  );

drop policy if exists treatment_plans_insert on public.treatment_plans;
create policy treatment_plans_insert on public.treatment_plans
  for insert with check (public.is_clinical(clinic_id) and created_by = auth.uid());

drop policy if exists treatment_plans_update on public.treatment_plans;
create policy treatment_plans_update on public.treatment_plans
  for update using (public.is_clinical(clinic_id)) with check (public.is_clinical(clinic_id));

drop policy if exists treatment_plans_delete on public.treatment_plans;
create policy treatment_plans_delete on public.treatment_plans
  for delete using (public.is_clinical(clinic_id) and status = 'nacrt');

drop policy if exists plan_items_select on public.plan_items;
create policy plan_items_select on public.plan_items
  for select using (public.is_staff(clinic_id) or public.plan_visible_to_me(plan_id));

drop policy if exists plan_items_insert on public.plan_items;
create policy plan_items_insert on public.plan_items
  for insert with check (public.is_clinical(clinic_id));

drop policy if exists plan_items_update on public.plan_items;
create policy plan_items_update on public.plan_items
  for update using (public.is_clinical(clinic_id)) with check (public.is_clinical(clinic_id));

drop policy if exists plan_items_delete on public.plan_items;
create policy plan_items_delete on public.plan_items
  for delete using (
    public.is_clinical(clinic_id) and done_at is null
    and exists (select 1 from public.treatment_plans p where p.id = plan_id and p.status = 'nacrt')
  );

revoke all on public.treatment_plans, public.plan_items from anon;
revoke truncate on public.treatment_plans, public.plan_items from authenticated;
grant select, insert, update, delete on public.treatment_plans, public.plan_items to authenticated;

-- Pacijent prihvata ili odbija poslani plan
create or replace function public.respond_plan(p_plan uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v public.treatment_plans;
begin
  select * into v from public.treatment_plans where id = p_plan for update;
  if not found or not public.is_my_patient(v.patient_id) or v.status = 'nacrt' then
    raise exception 'Plan ne postoji.';
  end if;
  if v.status <> 'poslan' then
    raise exception 'Na ovaj plan je već odgovoreno.';
  end if;
  if v.valid_until is not null and v.valid_until < current_date then
    raise exception 'Ponuda je istekla. Javite se ordinaciji.';
  end if;
  update public.treatment_plans
  set status = case when p_accept then 'prihvacen'::public.plan_status else 'odbijen'::public.plan_status end
  where id = p_plan;
end;
$$;

-- ---------- 5) Uplate ----------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_method' and typnamespace = 'public'::regnamespace) then
    create type public.payment_method as enum ('gotovina', 'kartica', 'prenos');
  end if;
end $$;

create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  plan_id      uuid references public.treatment_plans(id),
  amount       numeric(10,2) not null check (amount > 0 and amount <= 1000000),
  method       public.payment_method not null default 'gotovina',
  paid_on      date not null default current_date check (paid_on >= date '2000-01-01' and paid_on <= current_date + 1),
  note         text check (note is null or length(note) <= 500),
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  voided_at    timestamptz,
  voided_by    uuid references public.profiles(id) on delete set null,
  void_reason  text check (void_reason is null or length(trim(void_reason)) between 1 and 300)
);
create index if not exists payments_clinic_day_idx on public.payments (clinic_id, paid_on desc);
create index if not exists payments_patient_idx on public.payments (patient_id, paid_on desc);

-- Uplata se ne mijenja; jedino se stornira, s razlogom
create or replace function public.check_payment()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.voided_at is not null or new.voided_by is not null or new.void_reason is not null then
      raise exception 'Nova uplata ne može biti stornirana.';
    end if;
  else
    if (to_jsonb(new) - array['voided_at', 'voided_by', 'void_reason'])
       is distinct from (to_jsonb(old) - array['voided_at', 'voided_by', 'void_reason']) then
      raise exception 'Uplata se ne može mijenjati, samo stornirati.';
    end if;
    if old.voided_at is not null then
      raise exception 'Uplata je već stornirana.';
    end if;
    if new.void_reason is null or length(trim(new.void_reason)) = 0 then
      raise exception 'Upišite razlog storniranja.';
    end if;
    new.voided_at := now();
    new.voided_by := auth.uid();
  end if;
  if new.plan_id is not null and not exists (
    select 1 from public.treatment_plans where id = new.plan_id and patient_id = new.patient_id
  ) then
    raise exception 'Plan ne pripada ovom pacijentu.';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_check on public.payments;
create trigger payments_check
  before insert or update on public.payments
  for each row execute function public.check_payment();

drop trigger if exists payments_match on public.payments;
create trigger payments_match
  before insert or update on public.payments
  for each row execute function public.match_patient_clinic();

drop trigger if exists audit_payments on public.payments;
create trigger audit_payments
  after insert or update or delete on public.payments
  for each row execute function public.audit_row();

alter table public.payments enable row level security;

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (
    public.is_staff(clinic_id) or (voided_at is null and public.is_my_patient(patient_id))
  );

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert with check (public.is_staff(clinic_id) and created_by = auth.uid());

-- Stornira vlasnik ili onaj ko je uplatu upisao
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments
  for update
  using (
    public.is_staff(clinic_id)
    and (created_by = auth.uid() or public.has_role(clinic_id, array['owner']::public.clinic_role[]))
  )
  with check (public.is_staff(clinic_id));

revoke all on public.payments from anon;
revoke delete, truncate on public.payments from authenticated;
grant select, insert, update on public.payments to authenticated;

-- Stanje po pacijentu: urađeno (po cijenama iz prihvaćenih planova) minus uplaćeno.
-- security_invoker: pregled poštuje pravila pristupa tabela ispod.
create or replace view public.patient_balances
with (security_invoker = true) as
select
  p.id        as patient_id,
  p.clinic_id as clinic_id,
  coalesce(c.charged, 0)::numeric(12,2)                       as charged,
  coalesce(pay.paid, 0)::numeric(12,2)                        as paid,
  (coalesce(c.charged, 0) - coalesce(pay.paid, 0))::numeric(12,2) as balance
from public.patients p
left join (
  select i.patient_id, sum(round(i.unit_price * i.qty * (1 - pl.discount_pct / 100), 2)) as charged
  from public.plan_items i
  join public.treatment_plans pl on pl.id = i.plan_id
  where i.done_at is not null
  group by i.patient_id
) c on c.patient_id = p.id
left join (
  select patient_id, sum(amount) as paid
  from public.payments
  where voided_at is null
  group by patient_id
) pay on pay.patient_id = p.id;

revoke all on public.patient_balances from anon;
grant select on public.patient_balances to authenticated;

-- ---------- 6) Novosti i savjeti ----------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'post_kind' and typnamespace = 'public'::regnamespace) then
    create type public.post_kind as enum ('novost', 'savjet');
  end if;
end $$;

create table if not exists public.clinic_posts (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  kind          public.post_kind not null,
  title         text not null check (length(trim(title)) between 1 and 140),
  body          text not null check (length(trim(body)) between 1 and 8000),
  image_url     text check (image_url is null or length(image_url) <= 500),
  valid_until   date,
  is_published  boolean not null default false,
  published_at  timestamptz,
  created_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists clinic_posts_clinic_idx on public.clinic_posts (clinic_id, is_published, published_at desc);

create or replace function public.touch_post()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.is_published and (tg_op = 'INSERT' or not old.is_published) then
    new.published_at := now();
  elsif tg_op = 'UPDATE' then
    new.published_at := old.published_at;
  else
    new.published_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists clinic_posts_publish on public.clinic_posts;
create trigger clinic_posts_publish
  before insert or update on public.clinic_posts
  for each row execute function public.touch_post();

drop trigger if exists clinic_posts_touch on public.clinic_posts;
create trigger clinic_posts_touch
  before update on public.clinic_posts
  for each row execute function public.touch_row();

drop trigger if exists audit_clinic_posts on public.clinic_posts;
create trigger audit_clinic_posts
  after insert or update or delete on public.clinic_posts
  for each row execute function public.audit_row();

alter table public.clinic_posts enable row level security;

-- Pacijenti vide objavljene, dok ne isteknu; osoblje vidi sve
drop policy if exists clinic_posts_select on public.clinic_posts;
create policy clinic_posts_select on public.clinic_posts
  for select using (
    public.is_staff(clinic_id)
    or (public.my_role(clinic_id) = 'patient' and is_published
        and (valid_until is null or valid_until >= current_date))
  );

drop policy if exists clinic_posts_insert on public.clinic_posts;
create policy clinic_posts_insert on public.clinic_posts
  for insert with check (
    public.has_role(clinic_id, array['owner','doctor','specialist']::public.clinic_role[]) and created_by = auth.uid()
  );

drop policy if exists clinic_posts_update on public.clinic_posts;
create policy clinic_posts_update on public.clinic_posts
  for update
  using      (public.has_role(clinic_id, array['owner','doctor','specialist']::public.clinic_role[]))
  with check (public.has_role(clinic_id, array['owner','doctor','specialist']::public.clinic_role[]));

drop policy if exists clinic_posts_delete on public.clinic_posts;
create policy clinic_posts_delete on public.clinic_posts
  for delete using (
    public.has_role(clinic_id, array['owner']::public.clinic_role[])
    or (created_by = auth.uid() and public.has_role(clinic_id, array['doctor','specialist']::public.clinic_role[]))
  );

revoke all on public.clinic_posts from anon;
revoke truncate on public.clinic_posts from authenticated;
grant select, insert, update, delete on public.clinic_posts to authenticated;

-- ---------- 7) Aplikacija za pacijente: zubi, termini, online zakazivanje ----------

alter table public.appointments add column if not exists booked_online boolean not null default false;

-- Doktori ordinacije s imenom i slikom (pacijent ne vidi profile osoblja direktno)
create or replace function public.clinic_doctors(p_clinic uuid)
returns table (user_id uuid, full_name text, avatar_url text, specialty text, role public.clinic_role)
language sql stable security definer set search_path = public
as $$
  select m.user_id, p.full_name, p.avatar_url, m.specialty, m.role
  from public.clinic_members m
  join public.profiles p on p.id = m.user_id
  where m.clinic_id = p_clinic and m.is_active and m.role in ('owner', 'doctor', 'specialist')
    and public.my_role(p_clinic) is not null
  order by case m.role when 'owner' then 0 else 1 end, p.full_name;
$$;

-- Stanje mojih zuba (bez internih bilješki doktora)
create or replace function public.my_teeth(p_clinic uuid)
returns table (tooth smallint, condition text, endo boolean, surfaces jsonb)
language sql stable security definer set search_path = public
as $$
  select t.tooth, t.condition, t.endo, t.surfaces
  from public.tooth_status t
  join public.patients p on p.id = t.patient_id
  where p.clinic_id = p_clinic and p.user_id = auth.uid() and public.my_role(p_clinic) = 'patient';
$$;

-- Moji termini (bez internih napomena)
create or replace function public.my_appointments(p_clinic uuid)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, service text,
               status public.appointment_status, doctor_id uuid, doctor_name text, booked_online boolean)
language sql stable security definer set search_path = public
as $$
  select a.id, a.starts_at, a.ends_at, a.service, a.status, a.doctor_id, d.full_name, a.booked_online
  from public.appointments a
  join public.patients p on p.id = a.patient_id
  left join public.profiles d on d.id = a.doctor_id
  where p.clinic_id = p_clinic and p.user_id = auth.uid() and public.my_role(p_clinic) = 'patient'
    and a.starts_at > now() - interval '2 years'
  order by a.starts_at desc
  limit 200;
$$;

-- Slobodni termini doktora za dan, u radnom vremenu ordinacije (korak 30 min)
create or replace function public.available_slots(p_clinic uuid, p_doctor uuid, p_day date, p_minutes integer)
returns setof timestamptz
language plpgsql stable security definer set search_path = public
as $$
declare
  c       public.clinics;
  v_role  public.clinic_role := public.my_role(p_clinic);
  v_hours jsonb;
  v_dur   interval;
  v_today date;
begin
  if v_role is null then
    raise exception 'Nemate pristup ovoj ordinaciji.';
  end if;
  if p_minutes is null or p_minutes < 5 or p_minutes > 480 then
    raise exception 'Neispravno trajanje termina.';
  end if;
  select * into c from public.clinics where id = p_clinic;
  if v_role = 'patient' and not c.online_booking then
    raise exception 'Online zakazivanje trenutno nije uključeno.';
  end if;
  if not exists (
    select 1 from public.clinic_members
    where clinic_id = p_clinic and user_id = p_doctor and is_active and role in ('owner', 'doctor', 'specialist')
  ) then
    raise exception 'Izabrani doktor ne radi u ovoj ordinaciji.';
  end if;

  v_today := (now() at time zone c.timezone)::date;
  if p_day is null or p_day < v_today or p_day > v_today + 90 then
    return;
  end if;
  v_hours := c.working_hours -> (extract(dow from p_day)::int)::text;
  if v_hours is null then
    return;
  end if;
  v_dur := make_interval(mins => p_minutes);

  return query
    select s
    from generate_series(
      (p_day + (v_hours->>0)::time) at time zone c.timezone,
      (p_day + (v_hours->>1)::time) at time zone c.timezone - v_dur,
      interval '30 minutes'
    ) s
    where s >= now() + interval '1 hour'
      and not exists (
        select 1 from public.appointments a
        where a.doctor_id = p_doctor
          and a.status not in ('otkazan', 'nije_dosao')
          and tstzrange(a.starts_at, a.ends_at) && tstzrange(s, s + v_dur)
      )
    order by s;
end;
$$;

-- Pacijent sam zakazuje termin
create or replace function public.book_appointment(p_clinic uuid, p_doctor uuid, p_service uuid, p_start timestamptz, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  c          public.clinics;
  s          public.services;
  v_patient  uuid;
  v_id       uuid;
begin
  if public.my_role(p_clinic) is distinct from 'patient' then
    raise exception 'Online zakazivanje je za pacijente ordinacije.';
  end if;
  select * into c from public.clinics where id = p_clinic;
  if not c.online_booking then
    raise exception 'Online zakazivanje trenutno nije uključeno.';
  end if;
  select id into v_patient from public.patients
  where clinic_id = p_clinic and user_id = auth.uid() and not is_archived;
  if v_patient is null then
    raise exception 'Vaš nalog nije povezan s kartonom. Javite se ordinaciji.';
  end if;
  select * into s from public.services where id = p_service and clinic_id = p_clinic and is_active and online;
  if not found then
    raise exception 'Ova usluga se ne može zakazati online.';
  end if;
  if p_note is not null and length(p_note) > 500 then
    raise exception 'Napomena je preduga.';
  end if;
  if p_start is null or not exists (
    select 1 from public.available_slots(p_clinic, p_doctor, (p_start at time zone c.timezone)::date, s.duration_min) x
    where x = p_start
  ) then
    raise exception 'Termin više nije slobodan. Izaberite drugi.';
  end if;
  if (select count(*) from public.appointments
      where patient_id = v_patient and starts_at > now() and status in ('zakazan', 'potvrdjen')) >= 3 then
    raise exception 'Već imate 3 zakazana termina. Za još termina javite se ordinaciji.';
  end if;

  insert into public.appointments (clinic_id, patient_id, doctor_id, starts_at, ends_at, service, note, status, created_by, booked_online)
  values (p_clinic, v_patient, p_doctor, p_start, p_start + make_interval(mins => s.duration_min), s.name,
          nullif(trim(coalesce(p_note, '')), ''), 'zakazan', auth.uid(), true)
  returning id into v_id;
  return v_id;
end;
$$;

-- Pacijent otkazuje (najkasnije 24 sata prije) ili potvrđuje svoj termin
create or replace function public.cancel_my_appointment(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  a public.appointments;
begin
  select * into a from public.appointments where id = p_id for update;
  if not found or not public.is_my_patient(a.patient_id) then
    raise exception 'Termin ne postoji.';
  end if;
  if a.status not in ('zakazan', 'potvrdjen') then
    raise exception 'Ovaj termin se više ne može otkazati.';
  end if;
  if a.starts_at < now() + interval '24 hours' then
    raise exception 'Termin se online može otkazati najkasnije 24 sata prije. Nazovite ordinaciju.';
  end if;
  update public.appointments set status = 'otkazan' where id = p_id;
end;
$$;

create or replace function public.confirm_my_appointment(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  a public.appointments;
begin
  select * into a from public.appointments where id = p_id for update;
  if not found or not public.is_my_patient(a.patient_id) then
    raise exception 'Termin ne postoji.';
  end if;
  if a.status = 'potvrdjen' then
    return;
  end if;
  if a.status <> 'zakazan' or a.starts_at < now() then
    raise exception 'Ovaj termin se ne može potvrditi.';
  end if;
  update public.appointments set status = 'potvrdjen' where id = p_id;
end;
$$;

-- ---------- 8) Slike: logo, slika doktora, slike objava ----------
-- Javni bucket "media". Putanje:
--   users/<moj id>/<fajl>            slika profila (svako za sebe)
--   clinics/<ordinacija>/logo/<fajl>  logo (vlasnik)
--   clinics/<ordinacija>/posts/<fajl> slike objava (vlasnik, doktori)
create or replace function public.can_upload_media(p_name text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  parts    text[] := string_to_array(coalesce(p_name, ''), '/');
  n        integer := coalesce(array_length(parts, 1), 0);
  v_clinic uuid;
begin
  if auth.uid() is null or n < 3 then
    return false;
  end if;
  if parts[n] !~ '^[A-Za-z0-9_-]{8,80}\.(jpg|png|webp)$' then
    return false;
  end if;
  if n = 3 and parts[1] = 'users' and parts[2] = auth.uid()::text then
    return true;
  end if;
  if n = 4 and parts[1] = 'clinics' then
    v_clinic := public.try_uuid(parts[2]);
    if v_clinic is null then
      return false;
    end if;
    if parts[3] = 'logo' then
      return public.has_role(v_clinic, array['owner']::public.clinic_role[]);
    end if;
    if parts[3] = 'posts' then
      return public.has_role(v_clinic, array['owner','doctor','specialist']::public.clinic_role[]);
    end if;
  end if;
  return false;
end;
$$;

do $$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice 'Nema Supabase Storage šeme; bucket za slike nije napravljen.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('media', 'media', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists dp_media_insert on storage.objects;
  create policy dp_media_insert on storage.objects
    for insert to authenticated
    with check (bucket_id = 'media' and public.can_upload_media(name));

  drop policy if exists dp_media_select_own on storage.objects;
  create policy dp_media_select_own on storage.objects
    for select to authenticated
    using (bucket_id = 'media' and owner = auth.uid());
end $$;

-- ---------- 9) Dozvole za funkcije ----------

revoke execute on function
  public.touch_row(),
  public.check_invite(),
  public.check_plan(),
  public.check_plan_item(),
  public.check_payment(),
  public.touch_post(),
  public.lock_patient_identity()
from public, anon, authenticated;

revoke execute on function
  public.try_uuid(text),
  public.valid_hours(jsonb),
  public.is_timezone(text),
  public.is_my_patient(uuid),
  public.plan_visible_to_me(uuid),
  public.can_upload_media(text),
  public.unlink_patient_account(uuid),
  public.respond_plan(uuid, boolean),
  public.clinic_doctors(uuid),
  public.my_teeth(uuid),
  public.my_appointments(uuid),
  public.available_slots(uuid, uuid, date, integer),
  public.book_appointment(uuid, uuid, uuid, timestamptz, text),
  public.cancel_my_appointment(uuid),
  public.confirm_my_appointment(uuid),
  public.accept_invite(uuid)
from public, anon;

grant execute on function
  public.try_uuid(text),
  public.valid_hours(jsonb),
  public.is_timezone(text),
  public.is_my_patient(uuid),
  public.plan_visible_to_me(uuid),
  public.can_upload_media(text),
  public.unlink_patient_account(uuid),
  public.respond_plan(uuid, boolean),
  public.clinic_doctors(uuid),
  public.my_teeth(uuid),
  public.my_appointments(uuid),
  public.available_slots(uuid, uuid, date, integer),
  public.book_appointment(uuid, uuid, uuid, timestamptz, text),
  public.cancel_my_appointment(uuid),
  public.confirm_my_appointment(uuid),
  public.accept_invite(uuid)
to authenticated;

-- Integracijska provjera na izdvojenim, privremenim podacima.
begin;
do $test$
declare
  clinic uuid := gen_random_uuid();
  doc uuid := gen_random_uuid();
  usr uuid := gen_random_uuid();
  card uuid := gen_random_uuid();
  service_id uuid := gen_random_uuid();
  block_id uuid;
  visit_id uuid;
  day date := (now() at time zone 'Europe/Sarajevo')::date + 8;
  origin timestamptz := (day + time '09:00') at time zone 'Europe/Sarajevo';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (doc, doc::text || '@example.invalid', '{"full_name":"Test Doctor"}'),
    (usr, usr::text || '@example.invalid', '{"full_name":"Test Patient"}');
  insert into public.clinics (id, name, timezone, online_booking, working_hours)
    values (clinic, 'Test Calendar', 'Europe/Sarajevo', true, jsonb_build_object(extract(dow from day)::int::text, jsonb_build_array('09:00','17:00')));
  insert into public.clinic_members (clinic_id,user_id,role) values (clinic,doc,'owner'),(clinic,usr,'patient');
  insert into public.patients (id,clinic_id,first_name,last_name,user_id) values (card,clinic,'Test','Patient',usr);
  insert into public.services (id,clinic_id,name,price,duration_min,is_active,online) values (service_id,clinic,'Test service',20,60,true,true);

  perform set_config('request.jwt.claim.sub',doc::text,true);
  set local role authenticated;
  if not exists(select 1 from public.available_slots(clinic,doc,day + 112,120)) then
    raise exception 'Osoblje mora vidjeti slobodne termine u udaljenom mjesecu'; end if;
  insert into public.appointments (clinic_id,patient_id,is_private_block,doctor_id,starts_at,ends_at,service)
    values (clinic,null,true,doc,origin + interval '1 hour',origin + interval '3 hours','Blokirano vrijeme') returning id into block_id;
  begin
    insert into public.appointments (clinic_id,patient_id,doctor_id,starts_at,ends_at,service)
      values (clinic,card,doc,origin + interval '30 minutes',origin + interval '90 minutes','Test service');
    raise exception 'Preklapanje nije odbijeno';
  exception when exclusion_violation then null;
  end;
  perform set_config('request.jwt.claim.sub',usr::text,true);
  if exists(select 1 from public.available_slots(clinic,doc,day + 112,120)) then
    raise exception 'Online period za pacijenta'; end if;
  if exists (select 1 from public.my_appointments(clinic) where id=block_id) or
     exists (select 1 from public.appointments where id=block_id) then raise exception 'Pacijentski prikaz sadrži blokadu'; end if;
  if not exists (select 1 from public.available_slots(clinic,doc,day,60) s where s=origin) or
     exists (select 1 from public.available_slots(clinic,doc,day,120) s where s=origin) then raise exception 'Pogrešna dostupnost uz blokadu'; end if;
  visit_id := public.book_appointment(clinic,doc,service_id,origin);
  if not exists (select 1 from public.my_appointments(clinic) where id=visit_id and ends_at - starts_at=interval '60 minutes') then
    raise exception 'Trajanje prvog termina'; end if;

  perform set_config('request.jwt.claim.sub',doc::text,true);
  update public.appointments set status='otkazan' where id=block_id;
  update public.services set duration_min=150 where id=service_id;
  perform set_config('request.jwt.claim.sub',usr::text,true);
  if not exists (select 1 from public.available_slots(clinic,doc,day,150) s where s=origin + interval '1 hour') then
    raise exception 'Oslobođeno vrijeme nedostaje'; end if;
  visit_id := public.book_appointment(clinic,doc,service_id,origin + interval '1 hour');
  if not exists (select 1 from public.my_appointments(clinic) where id=visit_id and ends_at - starts_at=interval '150 minutes') then
    raise exception 'Trajanje druge usluge'; end if;
  reset role;
end;
$test$;
select 'Calendar integration passed' as result;
rollback;

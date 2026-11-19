-- Osoblje može planirati i nakon 90 dana. Online pravila pacijenata ostaju u ovoj funkciji.
create or replace function public.available_slots(p_clinic uuid, p_doctor uuid, p_day date, p_minutes integer)
returns setof timestamptz
language plpgsql stable security definer set search_path = ''
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
  if p_minutes is null or p_minutes < 5 or p_minutes > (case when v_role = 'patient' then 480 else 720 end) then
    raise exception 'Neispravno trajanje termina.';
  end if;
  select * into c from public.clinics where id = p_clinic;
  if v_role = 'patient' and not c.online_booking then
    raise exception 'Online zakazivanje trenutno nije uključeno.';
  end if;
  if not exists (
    select 1 from public.clinic_members
    where clinic_id = p_clinic and user_id = p_doctor and is_active
      and (role in ('owner', 'doctor', 'specialist') or (v_role <> 'patient' and role = 'assistant'))
  ) then
    raise exception 'Izabrani doktor ne radi u ovoj ordinaciji.';
  end if;

  v_today := (now() at time zone c.timezone)::date;
  if p_day is null or p_day < v_today or (v_role = 'patient' and p_day > v_today + 90) then
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
      ((p_day + (v_hours->>1)::time) at time zone c.timezone) - v_dur,
      interval '30 minutes'
    ) s
    where s >= now() + case when v_role = 'patient' then interval '1 hour' else interval '0' end
      and not exists (
        select 1 from public.appointments a
        where a.doctor_id = p_doctor
          and a.status not in ('otkazan', 'nije_dosao')
          and tstzrange(a.starts_at, a.ends_at) && tstzrange(s, s + v_dur)
      )
    order by s;
end;
$$;


-- DEMO podaci za prezentaciju (izmišljeni pacijenti). Brisanje: demo-obrisi.sql
-- Prije pokretanja zamijeni __C__ (id ordinacije) i __O__ (id vlasnika). Termini se računaju od današnjeg dana.
create or replace function pg_temp.at(d int, hm text) returns timestamptz language sql as
$$ select ((current_date + d)::timestamp + hm::time) at time zone 'Europe/Sarajevo' $$;

do $demo$
declare
  c uuid := '__C__';
  o uuid := '__O__';
  s_preg uuid; s_kont uuid; s_kam uuid; s_isp uuid; s_kan uuid; s_vad uuid; s_izb uuid; s_kru uuid; s_imp uuid; s_fas uuid; s_rtg uuid;
  p_lejla uuid; p_emir uuid; p_amra uuid; p_haris uuid; p_selma uuid; p_kenan uuid; p_ajla uuid; p_mirza uuid;
  pl uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', o::text, true);

  if exists (select 1 from public.patients where clinic_id = c and email like '%@demo.dentalpro.ba') then
    raise exception 'Demo podaci su već upisani.';
  end if;

  update public.clinics set
    online_booking = true,
    working_hours = '{"1":["10:00","18:00"],"2":["12:00","18:00"],"3":["10:00","18:00"],"4":["12:00","18:00"],"5":["10:00","18:00"],"6":["09:00","13:00"]}'::jsonb
  where id = c;

  -- Cjenovnik
  insert into public.services (clinic_id, name, price, duration_min, online) values (c, 'Pregled i konsultacije', 30, 30, true) returning id into s_preg;
  insert into public.services (clinic_id, name, price, duration_min, online) values (c, 'Kontrolni pregled', 20, 20, true) returning id into s_kont;
  insert into public.services (clinic_id, name, price, duration_min, online) values (c, 'Uklanjanje kamenca i poliranje', 60, 40, true) returning id into s_kam;
  insert into public.services (clinic_id, name, price, duration_min, online) values (c, 'Kompozitni ispun (bijela plomba)', 70, 45, true) returning id into s_isp;
  insert into public.services (clinic_id, name, price, duration_min, online) values (c, 'Liječenje kanala (po kanalu)', 80, 60, false) returning id into s_kan;
  insert into public.services (clinic_id, name, price, duration_min, online) values (c, 'Vađenje zuba', 50, 30, false) returning id into s_vad;
  insert into public.services (clinic_id, name, price, duration_min, online) values (c, 'Izbjeljivanje zuba u ordinaciji', 300, 90, true) returning id into s_izb;
  insert into public.services (clinic_id, name, price, duration_min, online) values (c, 'Keramička krunica', 350, 60, false) returning id into s_kru;
  insert into public.services (clinic_id, name, price, duration_min, online) values (c, 'Implantat s ugradnjom', 1200, 90, false) returning id into s_imp;
  insert into public.services (clinic_id, name, price, duration_min, online) values (c, 'Keramička faseta (po zubu)', 450, 60, false) returning id into s_fas;
  insert into public.services (clinic_id, name, price, duration_min, online) values (c, 'RTG snimak zuba', 10, 10, false) returning id into s_rtg;

  -- Pacijenti (izmišljeni)
  insert into public.patients (clinic_id, first_name, last_name, date_of_birth, sex, phone, email, city)
    values (c, 'Lejla', 'Hodžić', '1990-04-12', 'f', '061 111 222', 'lejla@demo.dentalpro.ba', 'Goražde') returning id into p_lejla;
  insert into public.patients (clinic_id, first_name, last_name, date_of_birth, sex, phone, email, city)
    values (c, 'Emir', 'Kovačević', '1978-09-03', 'm', '062 333 444', 'emir@demo.dentalpro.ba', 'Goražde') returning id into p_emir;
  insert into public.patients (clinic_id, first_name, last_name, date_of_birth, sex, phone, email, city)
    values (c, 'Amra', 'Mujić', '1995-01-27', 'f', '061 555 666', 'amra@demo.dentalpro.ba', 'Foča') returning id into p_amra;
  insert into public.patients (clinic_id, first_name, last_name, date_of_birth, sex, phone, email, city)
    values (c, 'Haris', 'Delić', '1985-06-18', 'm', '063 777 888', 'haris@demo.dentalpro.ba', 'Goražde') returning id into p_haris;
  insert into public.patients (clinic_id, first_name, last_name, date_of_birth, sex, phone, email, city)
    values (c, 'Selma', 'Begović', '1962-11-30', 'f', '061 999 000', 'selma@demo.dentalpro.ba', 'Goražde') returning id into p_selma;
  insert into public.patients (clinic_id, first_name, last_name, date_of_birth, sex, phone, email, city)
    values (c, 'Kenan', 'Hadžić', '2001-02-08', 'm', '062 121 212', 'kenan@demo.dentalpro.ba', 'Ustikolina') returning id into p_kenan;
  insert into public.patients (clinic_id, first_name, last_name, date_of_birth, sex, phone, email, city)
    values (c, 'Ajla', 'Softić', '1999-08-21', 'f', '061 343 434', 'ajla@demo.dentalpro.ba', 'Goražde') returning id into p_ajla;
  insert into public.patients (clinic_id, first_name, last_name, date_of_birth, sex, phone, email, city)
    values (c, 'Mirza', 'Omerović', '1970-03-14', 'm', '062 565 656', 'mirza@demo.dentalpro.ba', 'Goražde') returning id into p_mirza;

  -- Medicinski podaci
  insert into public.patient_medical (patient_id, clinic_id, allergies, medical_history, dental_history, updated_by) values
    (p_lejla, c, null, 'Bez hronične terapije.', 'Redovni pregledi; ranije ispuni na 16 i 47.', o),
    (p_emir,  c, 'Penicilin', 'Bez hronične terapije.', 'Implantat 37 (2021).', o),
    (p_selma, c, null, 'Hipertenzija, terapija: Concor 5 mg ujutro.', 'Krunice 11 i 21.', o),
    (p_mirza, c, 'Lateks', 'Dijabetes tip 2, Metformin.', null, o);

  -- Zubi
  insert into public.tooth_status (patient_id, clinic_id, tooth, condition, endo, surfaces, updated_by) values
    (p_lejla, c, 16, 'zdrav', false, '{"O":"ispun"}', o),
    (p_lejla, c, 26, 'zdrav', false, '{"D":"karijes","O":"plan"}', o),
    (p_lejla, c, 36, 'krunica', true, '{}', o),
    (p_lejla, c, 46, 'nedostaje', false, '{}', o),
    (p_lejla, c, 47, 'zdrav', false, '{"O":"ispun","M":"ispun"}', o),
    (p_emir,  c, 17, 'nedostaje', false, '{}', o),
    (p_emir,  c, 36, 'nedostaje', false, '{}', o),
    (p_emir,  c, 37, 'implantat', false, '{}', o),
    (p_amra,  c, 15, 'zdrav', false, '{"M":"karijes"}', o),
    (p_amra,  c, 25, 'zdrav', false, '{"D":"karijes"}', o),
    (p_selma, c, 11, 'krunica', false, '{}', o),
    (p_selma, c, 21, 'krunica', false, '{}', o),
    (p_mirza, c, 48, 'nedostaje', false, '{}', o);

  -- Historija u kartonu
  insert into public.patient_entries (clinic_id, patient_id, entry_date, tooth, diagnosis, treatment, note) values
    (c, p_lejla, current_date - 14, 36, 'Pulpitis chronica', 'Trepanacija, ekstirpacija pulpe, privremeni ispun', 'RTG prije zahvata.'),
    (c, p_lejla, current_date - 7, 36, null, 'Definitivno punjenje 3 kanala, RTG kontrola', null),
    (c, p_lejla, current_date - 2, 36, null, 'Cementirana keramička krunica', 'Zagriz provjeren, pacijentica zadovoljna.'),
    (c, p_emir, current_date - 30, null, 'Gingivitis', 'Uklanjanje kamenca, poliranje', 'Preporučena interdentalna četkica.'),
    (c, p_mirza, current_date - 2, 48, 'Impaktiran umnjak', 'Ekstrakcija 48', 'Kontrola za 7 dana.'),
    (c, p_selma, current_date - 40, 21, null, 'Kontrola krunica 11 i 21', 'Bez promjena.');

  -- Lejla: završeni plan (liječenje i krunica 36) + poslana ponuda (estetska sanacija)
  insert into public.treatment_plans (clinic_id, patient_id, title, note) values
    (c, p_lejla, 'Liječenje i krunica 36', 'Endodontski tretman i keramička krunica.') returning id into pl;
  insert into public.plan_items (plan_id, clinic_id, patient_id, service_id, tooth, description, unit_price, qty, position) values
    (pl, c, p_lejla, s_kan, 36, 'Liječenje kanala (po kanalu)', 80, 3, 1),
    (pl, c, p_lejla, s_kru, 36, 'Keramička krunica', 350, 1, 2);
  update public.treatment_plans set status = 'prihvacen' where id = pl;
  update public.plan_items set done_at = now() where plan_id = pl;
  insert into public.payments (clinic_id, patient_id, plan_id, amount, method, paid_on, note) values
    (c, p_lejla, pl, 150, 'gotovina', current_date - 14, null),
    (c, p_lejla, pl, 250, 'kartica', current_date - 2, null);

  insert into public.treatment_plans (clinic_id, patient_id, title, note, discount_pct, valid_until) values
    (c, p_lejla, 'Estetska sanacija', 'Implantat na mjestu 46, bijela plomba na 26 i izbjeljivanje. Redoslijed dogovaramo na pregledu.', 10, current_date + 30) returning id into pl;
  insert into public.plan_items (plan_id, clinic_id, patient_id, service_id, tooth, description, unit_price, qty, position) values
    (pl, c, p_lejla, s_imp, 46, 'Implantat s ugradnjom', 1200, 1, 1),
    (pl, c, p_lejla, s_isp, 26, 'Kompozitni ispun (bijela plomba)', 70, 1, 2),
    (pl, c, p_lejla, s_izb, null, 'Izbjeljivanje zuba u ordinaciji', 300, 1, 3);
  update public.treatment_plans set status = 'poslan' where id = pl;

  -- Emir: prihvaćen plan za implantat (još nije urađen)
  insert into public.treatment_plans (clinic_id, patient_id, title) values (c, p_emir, 'Implantat 36') returning id into pl;
  insert into public.plan_items (plan_id, clinic_id, patient_id, service_id, tooth, description, unit_price, qty, position) values
    (pl, c, p_emir, s_rtg, 36, 'RTG snimak zuba', 10, 1, 1),
    (pl, c, p_emir, s_imp, 36, 'Implantat s ugradnjom', 1200, 1, 2);
  update public.treatment_plans set status = 'prihvacen' where id = pl;

  -- Amra: nacrt plana
  insert into public.treatment_plans (clinic_id, patient_id, title) values (c, p_amra, 'Ispuni 15 i 25') returning id into pl;
  insert into public.plan_items (plan_id, clinic_id, patient_id, service_id, tooth, description, unit_price, qty, position) values
    (pl, c, p_amra, s_isp, 15, 'Kompozitni ispun (bijela plomba)', 70, 1, 1),
    (pl, c, p_amra, s_isp, 25, 'Kompozitni ispun (bijela plomba)', 70, 1, 2);

  -- Selma: plaćeno prošlog mjeseca
  insert into public.treatment_plans (clinic_id, patient_id, title) values (c, p_selma, 'Krunice 11 i 21') returning id into pl;
  insert into public.plan_items (plan_id, clinic_id, patient_id, service_id, tooth, description, unit_price, qty, position) values
    (pl, c, p_selma, s_kru, 11, 'Keramička krunica', 350, 1, 1),
    (pl, c, p_selma, s_kru, 21, 'Keramička krunica', 350, 1, 2);
  update public.treatment_plans set status = 'prihvacen' where id = pl;
  update public.plan_items set done_at = now() where plan_id = pl;
  update public.treatment_plans set status = 'zavrsen' where id = pl;
  insert into public.payments (clinic_id, patient_id, plan_id, amount, method, paid_on) values
    (c, p_selma, pl, 700, 'kartica', current_date - 40);

  -- Kenan: kamenac plaćen gotovinom
  insert into public.treatment_plans (clinic_id, patient_id, title) values (c, p_kenan, 'Uklanjanje kamenca') returning id into pl;
  insert into public.plan_items (plan_id, clinic_id, patient_id, service_id, description, unit_price, qty, position) values
    (pl, c, p_kenan, s_kam, 'Uklanjanje kamenca i poliranje', 60, 1, 1);
  update public.treatment_plans set status = 'prihvacen' where id = pl;
  update public.plan_items set done_at = now() where plan_id = pl;
  update public.treatment_plans set status = 'zavrsen' where id = pl;
  insert into public.payments (clinic_id, patient_id, plan_id, amount, method, paid_on) values
    (c, p_kenan, pl, 60, 'gotovina', current_date - 7);

  -- Mirza: vađenje urađeno, još nije plaćeno (vidi se u dugovanjima)
  insert into public.treatment_plans (clinic_id, patient_id, title) values (c, p_mirza, 'Vađenje 48') returning id into pl;
  insert into public.plan_items (plan_id, clinic_id, patient_id, service_id, tooth, description, unit_price, qty, position) values
    (pl, c, p_mirza, s_vad, 48, 'Vađenje zuba', 50, 1, 1),
    (pl, c, p_mirza, s_rtg, 48, 'RTG snimak zuba', 10, 1, 2);
  update public.treatment_plans set status = 'prihvacen' where id = pl;
  update public.plan_items set done_at = now() where plan_id = pl;

  -- Termini (radno vrijeme: pon/sri/pet 10-18, uto/čet 12-18, sub 9-13)
  insert into public.appointments (clinic_id, patient_id, doctor_id, starts_at, ends_at, service, note, status) values
    (c, p_lejla, o, pg_temp.at(-14, '13:00'), pg_temp.at(-14, '14:00'), 'Liječenje kanala 36', null, 'zavrsen'),
    (c, p_lejla, o, pg_temp.at(-7, '14:00'),  pg_temp.at(-7, '15:00'),  'Punjenje kanala 36', null, 'zavrsen'),
    (c, p_kenan, o, pg_temp.at(-7, '16:00'),  pg_temp.at(-7, '16:40'),  'Uklanjanje kamenca i poliranje', null, 'zavrsen'),
    (c, p_lejla, o, pg_temp.at(-2, '15:00'),  pg_temp.at(-2, '16:00'),  'Keramička krunica 36', null, 'zavrsen'),
    (c, p_mirza, o, pg_temp.at(-2, '16:30'),  pg_temp.at(-2, '17:00'),  'Vađenje zuba 48', null, 'zavrsen');

  -- Termini od danas: na prve slobodne radne dane
  declare
    d int := 0; n int := 0; dow int;
    slots text[]; slot text;
    list uuid[] := array[p_emir, p_amra, p_haris, p_selma, p_ajla, p_kenan, p_mirza, p_amra, p_haris, p_emir];
    svc  text[] := array['Uklanjanje kamenca i poliranje','Kompozitni ispun 15','Pregled i konsultacije','Kontrolni pregled','Izbjeljivanje zuba u ordinaciji','Kontrolni pregled','Kontrola nakon vađenja 48','Kompozitni ispun 25','Kontrolni pregled','RTG snimak 36'];
    mins int[]  := array[40,45,30,20,90,20,20,45,20,10];
    stat text[] := array['potvrdjen','potvrdjen','zakazan','zakazan','potvrdjen','zakazan','zakazan','zakazan','zakazan','zakazan'];
    notes text[] := array[null,null,'Boli zub dolje desno.',null,null,null,null,null,null,null];
  begin
    while n < array_length(list, 1) and d < 14 loop
      d := d + 1;
      dow := extract(isodow from current_date + d)::int;
      slots := case when dow in (1,3,5) then array['10:00','12:00','15:30'] when dow in (2,4) then array['12:30','16:00'] when dow = 6 then array['09:30'] else array[]::text[] end;
      foreach slot in array slots loop
        exit when n >= array_length(list, 1);
        n := n + 1;
        insert into public.appointments (clinic_id, patient_id, doctor_id, starts_at, ends_at, service, note, status)
        values (c, list[n], o, pg_temp.at(d, slot), pg_temp.at(d, slot) + make_interval(mins => mins[n]), svc[n], notes[n], stat[n]::public.appointment_status);
      end loop;
    end loop;
    -- Lejlin sljedeći termin: prvi radni dan poslije toga u 14:00
    loop
      d := d + 1;
      exit when extract(isodow from current_date + d)::int between 1 and 5;
    end loop;
    insert into public.appointments (clinic_id, patient_id, doctor_id, starts_at, ends_at, service, status)
    values (c, p_lejla, o, pg_temp.at(d, '14:00'), pg_temp.at(d, '14:20'), 'Kontrolni pregled', 'potvrdjen');
  end;

  -- Novosti i savjeti
  insert into public.clinic_posts (clinic_id, kind, title, body, valid_until, is_published) values
    (c, 'novost', 'Do kraja mjeseca: 15% popusta na izbjeljivanje',
     $q$Do kraja mjeseca nudimo 15% popusta na izbjeljivanje zuba u ordinaciji.

Termin zakažite ovdje u aplikaciji, pod "Termini".

Popust se ne kombinuje s drugim akcijama.$q$, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, true),
    (c, 'novost', 'Termin sada zakazujete u aplikaciji',
     $q$Slobodne termine vidite u aplikaciji i zakazujete ih u nekoliko dodira, bez čekanja na telefon.

Dan prije termina potvrdite dolazak. Ako ne možete doći, otkažite najkasnije 24 sata prije, da termin dobije neko drugi.$q$, null, true),
    (c, 'savjet', $q$Kako pravilno prati zube$q$, $q$Zube perite dva puta dnevno, ujutro i navečer prije spavanja, po dvije minute.

Koristite mekanu četkicu i pastu s fluorom. Odraslima je dovoljna količina paste veličine zrna graška; djeci do tri godine tek tanak sloj, veličine zrna riže.

Četkicu držite pod uglom od oko 45 stepeni prema desni i perite kratkim, nježnim pokretima. Prođite sve površine: vanjsku, unutrašnju i žvačnu. Na kraju očetkajte i jezik.

Nakon pranja ispljunite višak paste, ali usta nemojte odmah ispirati vodom. Tako fluor duže ostaje na zubima.

Prostor između zuba četkica ne dohvata. Jednom dnevno koristite zubni konac ili interdentalne četkice; na pregledu ćemo vam pokazati koja veličina vam odgovara.

Četkicu mijenjajte svaka tri mjeseca, ili ranije ako se vlakna raščupaju.$q$, null, true),
    (c, 'savjet', $q$Nakon vađenja zuba$q$, $q$Gazu koju ste dobili čvrsto držite zagrizenu 30 do 45 minuta. Ako krvarenje nastavi, stavite novu čistu gazu i ponovo zagrizite.

Prvih 24 sata ne ispirajte usta, ne pijte na slamku i ne pušite. Tako se ugrušak u rani ne pomjera, a on je prirodni "zavoj" koji omogućava zarastanje.

Dok anestezija traje, ne jedite i ne pijte vruće napitke, da se ne ugrizete ili opečete.

Prvi dan možete stavljati hladan oblog na obraz, po 15 do 20 minuta s pauzama. Jedite mekanu, mlaku hranu i žvačite na drugoj strani.

Od drugog dana usta nježno ispirajte mlakom slanom vodom, posebno nakon jela. Zube perite normalno, ali oprezno oko rane.

Lijekove protiv bolova uzimajte kako vam je doktor preporučio.

Javite nam se ako krvarenje ne prestaje, ako dobijete temperaturu, ako otok raste nakon trećeg dana ili ako se bol pojača dva do četiri dana nakon vađenja.$q$, null, true),
    (c, 'savjet', $q$Zašto su redovni pregledi važni$q$, $q$Karijes i upala desni u početku obično ne bole. Na pregledu ih otkrijemo dok je liječenje kratko, jednostavno i jeftinije.

Preporučujemo pregled i čišćenje kamenca svakih šest mjeseci, ili onako kako vam doktor savjetuje.

Javite se i ranije ako primijetite krvarenje desni pri pranju, osjetljivost na hladno ili toplo, bol pri žvakanju ili neprijatan zadah koji ne prolazi.

Termin za pregled možete zakazati u ovoj aplikaciji.$q$, null, true);

end;
$demo$;

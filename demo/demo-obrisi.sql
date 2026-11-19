
-- Briše demo podatke (pacijente s emailom @demo.dentalpro.ba, njihove termine, planove, uplate, poruke),
-- demo cjenovnik i demo objave. Ordinacija, nalozi i postavke ostaju.
do $w$
declare c uuid := '__C__';
begin
  delete from public.payments where clinic_id = c and patient_id in (select id from public.patients where clinic_id = c and email like '%@demo.dentalpro.ba');
  delete from public.patients where clinic_id = c and email like '%@demo.dentalpro.ba';
  delete from public.services where clinic_id = c and name in ('Pregled i konsultacije','Kontrolni pregled','Uklanjanje kamenca i poliranje','Kompozitni ispun (bijela plomba)','Liječenje kanala (po kanalu)','Vađenje zuba','Izbjeljivanje zuba u ordinaciji','Keramička krunica','Implantat s ugradnjom','Keramička faseta (po zubu)','RTG snimak zuba');
  delete from public.clinic_posts where clinic_id = c and title in ('Do kraja mjeseca: 15% popusta na izbjeljivanje','Termin sada zakazujete u aplikaciji','Kako pravilno prati zube','Nakon vađenja zuba','Zašto su redovni pregledi važni');
end $w$;

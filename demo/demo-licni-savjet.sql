-- Lični savjet za demo pacijentkinju Lejlu (traži migraciju 08)
select set_config('request.jwt.claims', json_build_object('sub', '__O__', 'role', 'authenticated')::text, false);
insert into public.patient_messages (clinic_id, patient_id, kind, title, body, created_by)
select '__C__', p.id, 'savjet', 'Lejla, njega krunice na 36',
$q$Krunica je cementirana i možete normalno jesti. Prva dva dana žvačite malo opreznije i izbjegavajte jako tvrdu hranu.

Zub ispod krunice je liječen i više ne osjeća bol, ali desni oko krunice trebaju njegu kao i ostali zubi. Perite ih nježno, a prostor uz krunicu čistite koncem ili interdentalnom četkicom jednom dnevno.

Ako vam se čini da krunica "smeta" pri zagrizu, javite se. Sitna korekcija traje nekoliko minuta.

Vidimo se na kontroli, a za estetsku sanaciju vam je ponuda u aplikaciji pod "Moj karton".$q$, '__O__'
from public.patients p where p.clinic_id = '__C__' and p.email = 'lejla@demo.dentalpro.ba';

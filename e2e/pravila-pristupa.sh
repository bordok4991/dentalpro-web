#!/bin/bash
# Traži praznu bazu dp_test sa šemom: e2e/shim.sql, pa redom svi fajlovi iz db/.
# Test pravila pristupa. Pokreće se kao root; psql ide kroz korisnika postgres.
DB=dp_test
PASS=0; FAIL=0
sq() { su postgres -c "psql -At -d $DB" 2>&1; }            # kao postgres (SQL Editor)
admin() { echo "$1" | sq; }
as() {  # as <uuid|anon> <sql>
  if [ "$1" = "anon" ]; then echo "set role anon; $2" | sq
  else echo "set role authenticated; set request.jwt.claim.sub = '$1'; $2" | sq; fi
}
ok()  { PASS=$((PASS+1)); echo "  OK   $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL $1 -> dobio: $2"; }
eq()  { [ "$2" = "$3" ] && ok "$1" || bad "$1" "$2 (očekivano $3)"; }
has() { echo "$2" | grep -q "$3" && ok "$1" || bad "$1" "$2"; }

mk() { admin "insert into auth.users (email, raw_user_meta_data) values ('$1', '{\"full_name\":\"$2\",\"phone\":\"+38761000000\"}') returning id" | head -1; }
ADMIN=$(mk admin@t.ba "Super Admin")
OA=$(mk ownera@t.ba "Vlasnik A");  OB=$(mk ownerb@t.ba "Vlasnik B")
DA=$(mk doca@t.ba "Doktor A");     RA=$(mk recepa@t.ba "Recepcija A")
P1=$(mk pac1@t.ba "Pacijent Jedan"); P2=$(mk pac2@t.ba "Pacijent Dva")
OUT=$(mk stranac@t.ba "Stranac")
admin "insert into public.platform_admins (user_id) values ('$ADMIN')" >/dev/null

echo "== Registracija"
eq "profil se pravi automatski" "$(admin "select count(*) from profiles")" "8"
CA=$(as $OA "select register_clinic('Klinika A','dr A','Goražde')" | tail -1)
CB=$(as $OB "select register_clinic('Klinika B')" | tail -1)
eq "vlasnik A vidi samo svoju ordinaciju" "$(as $OA "select string_agg(name, ',') from clinics" | tail -1)" "Klinika A"
eq "vlasnik B vidi samo svoju ordinaciju" "$(as $OB "select string_agg(name, ',') from clinics" | tail -1)" "Klinika B"
eq "probni period je 14 dana" "$(admin "select status || ':' || (trial_ends_at::date - now()::date) from clinics where id='$CA'")" "trial:14"
has "druga probna ordinacija je odbijena" "$(as $OA "select register_clinic('Jos jedna')")" "probnom periodu"
has "anonimni ne može registrovati ordinaciju" "$(as anon "select register_clinic('X klinika')")" "permission denied"
has "prekratko ime ordinacije je odbijeno" "$(as $OUT "select register_clinic('x')")" "violates check"
has "create_clinic_for nije dostupna iz aplikacije" "$(as $OUT "select create_clinic_for('$OUT','Hak klinika')")" "permission denied"

echo "== Pozivnice"
inv() { as $OA "insert into clinic_invites (clinic_id,email,role) values ('$CA','$1','$2') returning token" | sed -n 3p; }
TD=$(inv doca@t.ba doctor); TR=$(inv recepa@t.ba reception); T1=$(inv pac1@t.ba patient); T2=$(inv pac2@t.ba patient)
has "pozivnica za ulogu vlasnika je odbijena" "$(as $OA "insert into clinic_invites (clinic_id,email,role) values ('$CA','x@t.ba','owner')")" "violates check"
has "vlasnik B ne može pozivati u ordinaciju A" "$(as $OB "insert into clinic_invites (clinic_id,email,role) values ('$CA','x@t.ba','doctor')")" "row-level security"
has "tuđa pozivnica (drugi email) je odbijena" "$(as $OUT "select accept_invite('$TD')")" "drugu email"
as $DA "select accept_invite('$TD')" >/dev/null; as $RA "select accept_invite('$TR')" >/dev/null
as $P1 "select accept_invite('$T1')" >/dev/null; as $P2 "select accept_invite('$T2')" >/dev/null
eq "ordinacija A ima 5 članova" "$(admin "select count(*) from clinic_members where clinic_id='$CA'")" "5"
has "iskorištena pozivnica se ne može ponoviti" "$(as $DA "select accept_invite('$TD')")" "iskorištena"
TX=$(inv stranac@t.ba assistant); admin "update clinic_invites set expires_at = now() - interval '1 day' where token='$TX'" >/dev/null
has "istekla pozivnica je odbijena" "$(as $OUT "select accept_invite('$TX')")" "istekla"

echo "== Izolacija ordinacija"
eq "vlasnik A ne vidi članove ordinacije B" "$(as $OA "select count(*) from clinic_members where clinic_id='$CB'" | tail -1)" "0"
eq "vlasnik A ne može mijenjati ordinaciju B" "$(as $OA "update clinics set name='Hak' where id='$CB' returning 1" | grep -c '^1$')" "0"
eq "ordinacija B je netaknuta" "$(admin "select name from clinics where id='$CB'")" "Klinika B"
eq "vlasnik A ne vidi profil vlasnika B" "$(as $OA "select count(*) from profiles where id='$OB'" | tail -1)" "0"
eq "stranac ne vidi nijednu ordinaciju" "$(as $OUT "select count(*) from clinics" | tail -1)" "0"
has "anonimni nema pristup ordinacijama" "$(as anon "select count(*) from clinics")" "permission denied"
has "anonimni nema pristup profilima" "$(as anon "select count(*) from profiles")" "permission denied"

echo "== Uloge unutar ordinacije"
eq "doktor vidi cijeli tim (5)" "$(as $DA "select count(*) from clinic_members" | tail -1)" "5"
eq "doktor ne može mijenjati postavke ordinacije" "$(as $DA "update clinics set name='Hak' where id='$CA' returning 1" | grep -c '^1$')" "0"
eq "doktor ne vidi pozivnice" "$(as $DA "select count(*) from clinic_invites" | tail -1)" "0"
eq "doktor ne vidi audit log" "$(as $DA "select count(*) from audit_log" | tail -1)" "0"
eq "doktor ne može sebe unaprijediti u vlasnika" "$(as $DA "update clinic_members set role='owner' where user_id='$DA' returning 1" | grep -c '^1$')" "0"
eq "pacijent vidi samo svoje članstvo" "$(as $P1 "select count(*) from clinic_members" | tail -1)" "1"
eq "pacijent vidi samo svoj profil" "$(as $P1 "select count(*) from profiles" | tail -1)" "1"
eq "pacijent ne vidi drugog pacijenta" "$(as $P1 "select count(*) from profiles where id='$P2'" | tail -1)" "0"
eq "recepcija vidi oba pacijenta" "$(as $RA "select count(*) from profiles where id in ('$P1','$P2')" | tail -1)" "2"
eq "korisnik mijenja svoj profil" "$(as $P1 "update profiles set locale='en' where id='$P1' returning 1" | grep -c '^1$')" "1"
eq "korisnik ne može mijenjati tuđi profil" "$(as $P1 "update profiles set full_name='Hak' where id='$DA' returning 1" | grep -c '^1$')" "0"

echo "== Profili i email"
eq "email naloga je upisan u profil" "$(admin "select email from profiles where id='$DA'")" "doca@t.ba"
has "korisnik ne može sam mijenjati email u profilu" "$(as $P1 "update profiles set email='lazni@t.ba' where id='$P1'")" "permission denied"
admin "update auth.users set email='pac1-novi@t.ba' where id='$P1'" >/dev/null
eq "promjena emaila naloga se prenosi u profil" "$(admin "select email from profiles where id='$P1'")" "pac1-novi@t.ba"
eq "vlasnik vidi email i ime člana tima" "$(as $OA "select full_name || '/' || email from profiles where id='$DA'" | tail -1)" "Doktor A/doca@t.ba"
eq "korisnik mijenja svoje ime i telefon" "$(as $P1 "update profiles set full_name='Novo Ime', phone='+38762111222' where id='$P1' returning 1" | grep -c '^1$')" "1"
has "korisnik ne može obrisati profil" "$(as $P1 "delete from profiles where id='$P1'")" "permission denied"

echo "== Karton pacijenta"
PT1=$(as $DA "insert into patients (clinic_id,first_name,last_name,date_of_birth,phone) values ('$CA','Ana','Anić','1990-05-01','061111222') returning id" | sed -n 3p)
PT2=$(as $RA "insert into patients (clinic_id,first_name,last_name) values ('$CA','Bego','Begić') returning id" | sed -n 3p)
PTB=$(as $OB "insert into patients (clinic_id,first_name,last_name) values ('$CB','Cvijeta','Cvijić') returning id" | sed -n 3p)
eq "brojevi kartona idu redom po ordinaciji" "$(admin "select string_agg(card_number::text, ',' order by card_number) from patients where clinic_id='$CA'")" "1,2"
eq "druga ordinacija ima svoj brojač" "$(admin "select card_number from patients where id='$PTB'")" "1"
eq "pretraga bez kvačica nalazi Begića" "$(as $RA "select last_name from patients where search_key like '%begic%'" | tail -1)" "Begić"
eq "recepcija vidi pacijente svoje ordinacije" "$(as $RA "select count(*) from patients" | tail -1)" "2"
eq "vlasnik B vidi samo svoje pacijente" "$(as $OB "select count(*) from patients" | tail -1)" "1"
eq "pacijent ne vidi kartone" "$(as $P1 "select count(*) from patients" | tail -1)" "0"
eq "stranac ne vidi kartone" "$(as $OUT "select count(*) from patients" | tail -1)" "0"
eq "Super Admin ne vidi podatke pacijenata" "$(as $ADMIN "select count(*) from patients" | tail -1)" "0"
has "anonimni nema pristup kartonima" "$(as anon "select count(*) from patients")" "permission denied"
has "pacijent ne može dodati karton" "$(as $P1 "insert into patients (clinic_id,first_name,last_name) values ('$CA','X','Y')")" "row-level security"
has "vlasnik B ne može dodati pacijenta u ordinaciju A" "$(as $OB "insert into patients (clinic_id,first_name,last_name) values ('$CA','X','Y')")" "row-level security"
has "datum rođenja u budućnosti je odbijen" "$(as $DA "insert into patients (clinic_id,first_name,last_name,date_of_birth) values ('$CA','X','Y', current_date + 3)")" "violates check"
has "broj kartona se ne može promijeniti" "$(as $DA "update patients set card_number=99 where id='$PT1'")" "ne mogu mijenjati"
has "pacijent se ne može prebaciti u drugu ordinaciju" "$(as $OA "update patients set clinic_id='$CB' where id='$PT1'")" "ne mogu mijenjati\|row-level security"
has "pacijent se ne može obrisati" "$(as $OA "delete from patients where id='$PT2'")" "permission denied"
eq "recepcija mijenja kontakt pacijenta" "$(as $RA "update patients set phone='062333444' where id='$PT2' returning 1" | grep -c '^1$')" "1"
eq "pacijent se arhivira umjesto brisanja" "$(as $DA "update patients set is_archived=true where id='$PT2' returning 1" | grep -c '^1$')" "1"

eq "doktor upisuje alergije" "$(as $DA "insert into patient_medical (patient_id,clinic_id,allergies) values ('$PT1','$CA','Penicilin') returning 1" | grep -c '^1$')" "1"
eq "doktor čita medicinske podatke" "$(as $DA "select allergies from patient_medical where patient_id='$PT1'" | tail -1)" "Penicilin"
eq "recepcija ne vidi medicinske podatke" "$(as $RA "select count(*) from patient_medical" | tail -1)" "0"
has "recepcija ne može upisati medicinske podatke" "$(as $RA "insert into patient_medical (patient_id,clinic_id,notes) values ('$PT2','$CA','x')")" "row-level security"
eq "izmjena medicinskih podataka bilježi autora" "$(as $OA "update patient_medical set notes='Dijabetes' where patient_id='$PT1' returning updated_by" | sed -n 3p)" "$OA"
has "medicinski podaci se ne mogu vezati za tuđeg pacijenta" "$(as $OB "insert into patient_medical (patient_id,clinic_id,notes) values ('$PT1','$CB','x')")" "ne pripada"

E1=$(as $DA "insert into patient_entries (clinic_id,patient_id,tooth,diagnosis,treatment) values ('$CA','$PT1',16,'Karijes','Kompozitni ispun') returning id" | sed -n 3p)
eq "doktor upisuje zapis za zub 16" "$(admin "select tooth || '/' || author_id from patient_entries where id='$E1'")" "16/$DA"
eq "mliječni zub 55 je ispravna oznaka" "$(as $DA "insert into patient_entries (clinic_id,patient_id,tooth,note) values ('$CA','$PT1',55,'Kontrola') returning 1" | grep -c '^1$')" "1"
has "zub 19 nije FDI oznaka" "$(as $DA "insert into patient_entries (clinic_id,patient_id,tooth,note) values ('$CA','$PT1',19,'x')")" "violates check"
has "zub 59 nije FDI oznaka" "$(as $DA "insert into patient_entries (clinic_id,patient_id,tooth,note) values ('$CA','$PT1',59,'x')")" "violates check"
has "prazan zapis je odbijen" "$(as $DA "insert into patient_entries (clinic_id,patient_id,diagnosis) values ('$CA','$PT1','   ')")" "violates check"
has "zapis se ne može upisati u tuđe ime" "$(as $DA "insert into patient_entries (clinic_id,patient_id,note,author_id) values ('$CA','$PT1','x','$OA')")" "row-level security"
eq "recepcija ne vidi zapise" "$(as $RA "select count(*) from patient_entries" | tail -1)" "0"
has "recepcija ne može upisati zapis" "$(as $RA "insert into patient_entries (clinic_id,patient_id,note) values ('$CA','$PT1','x')")" "row-level security"
eq "autor ispravlja svoj zapis" "$(as $DA "update patient_entries set treatment='Kompozitni ispun, klasa II' where id='$E1' returning 1" | grep -c '^1$')" "1"
eq "vlasnik ispravlja tuđi zapis" "$(as $OA "update patient_entries set note='Pregledano' where id='$E1' returning 1" | grep -c '^1$')" "1"
has "autor zapisa se ne može promijeniti" "$(as $OA "update patient_entries set author_id='$OA' where id='$E1'")" "ne može mijenjati"
has "zapis se ne može obrisati" "$(as $OA "delete from patient_entries where id='$E1'")" "permission denied"
has "zapis se ne može premjestiti na drugog pacijenta" "$(as $OA "update patient_entries set patient_id='$PT2' where id='$E1'")" "premjestiti"
has "brojač kartona nije dostupan iz aplikacije" "$(as $OA "select * from clinic_counters")" "permission denied"
eq "izmjene kartona su u audit logu" "$(admin "select count(distinct table_name) from audit_log where table_name in ('patients','patient_medical','patient_entries') and clinic_id='$CA'")" "3"
eq "audit bilježi id pacijenta za medicinske podatke" "$(admin "select count(*) from audit_log where table_name='patient_medical' and row_id='$PT1'")" "2"

echo "== Stanje zuba"
eq "doktor upisuje karijes na zubu 36" "$(as $DA "insert into tooth_status (patient_id,clinic_id,tooth,surfaces) values ('$PT1','$CA',36,'{\"D\":\"karijes\"}') returning 1" | grep -c '^1$')" "1"
eq "stanje zuba bilježi ko je upisao" "$(admin "select updated_by from tooth_status where patient_id='$PT1' and tooth=36")" "$DA"
eq "vlasnik mijenja stanje istog zuba" "$(as $OA "insert into tooth_status (patient_id,clinic_id,tooth,condition,endo,surfaces) values ('$PT1','$CA',36,'krunica',true,'{}') on conflict (patient_id,tooth) do update set condition=excluded.condition, endo=excluded.endo, surfaces=excluded.surfaces returning condition || '/' || updated_by" | sed -n 3p)" "krunica/$OA"
eq "mliječni zub 85 ima svoje stanje" "$(as $DA "insert into tooth_status (patient_id,clinic_id,tooth,condition) values ('$PT1','$CA',85,'nedostaje') returning 1" | grep -c '^1$')" "1"
has "nepoznata površina je odbijena" "$(as $DA "insert into tooth_status (patient_id,clinic_id,tooth,surfaces) values ('$PT1','$CA',11,'{\"X\":\"karijes\"}')")" "violates check"
has "nepoznato stanje površine je odbijeno" "$(as $DA "insert into tooth_status (patient_id,clinic_id,tooth,surfaces) values ('$PT1','$CA',11,'{\"M\":\"slomljen\"}')")" "violates check"
has "nepoznato stanje zuba je odbijeno" "$(as $DA "insert into tooth_status (patient_id,clinic_id,tooth,condition) values ('$PT1','$CA',11,'polomljen')")" "violates check"
has "zub 19 nije ispravna oznaka" "$(as $DA "insert into tooth_status (patient_id,clinic_id,tooth) values ('$PT1','$CA',19)")" "violates check"
eq "recepcija ne vidi stanje zuba" "$(as $RA "select count(*) from tooth_status" | tail -1)" "0"
has "recepcija ne može upisati stanje zuba" "$(as $RA "insert into tooth_status (patient_id,clinic_id,tooth) values ('$PT2','$CA',11)")" "row-level security"
has "stanje zuba se ne veže za tuđeg pacijenta" "$(as $OB "insert into tooth_status (patient_id,clinic_id,tooth) values ('$PT1','$CB',11)")" "ne pripada"
eq "vlasnik B ne vidi stanje zuba ordinacije A" "$(as $OB "select count(*) from tooth_status" | tail -1)" "0"
has "stanje zuba se ne može obrisati" "$(as $OA "delete from tooth_status where patient_id='$PT1'")" "permission denied"
eq "stanje zuba je u audit logu" "$(admin "select count(*) from audit_log where table_name='tooth_status' and row_id='$PT1'")" "3"

echo "== Termini"
ap() { # ap <korisnik> <doktor> <od> <do> [pacijent] [ordinacija]
  as $1 "insert into appointments (clinic_id,patient_id,doctor_id,starts_at,ends_at,service) values ('${6:-$CA}','${5:-$PT1}','$2','2030-03-04 $3+01','2030-03-04 $4+01','Kontrola') returning id"
}
A1=$(ap $RA $DA 10:00 10:30 | sed -n 3p)
eq "recepcija zakazuje termin kod doktora" "$(admin "select service || '/' || created_by || '/' || status from appointments where id='$A1'")" "Kontrola/$RA/zakazan"
has "preklapanje termina istog doktora je odbijeno" "$(ap $RA $DA 10:15 10:45)" "appointments_no_overlap"
eq "termin odmah nakon prethodnog je dozvoljen" "$(ap $RA $DA 10:30 11:00 | grep -c '^[0-9a-f-]\{36\}$')" "1"
eq "drugi doktor može u isto vrijeme" "$(ap $RA $OA 10:00 10:30 | grep -c '^[0-9a-f-]\{36\}$')" "1"
has "recepcija ne može biti doktor u terminu" "$(ap $OA $RA 12:00 12:30)" "ne radi u ovoj ordinaciji"
has "pacijent ne može biti doktor u terminu" "$(ap $OA $P1 12:00 12:30)" "ne radi u ovoj ordinaciji"
has "doktor iz druge ordinacije je odbijen" "$(ap $OA $OB 12:00 12:30)" "ne radi u ovoj ordinaciji"
has "termin za tuđeg pacijenta je odbijen" "$(ap $OB $OB 12:00 12:30 $PT1 $CB)" "ne pripada"
has "termin ne može završiti prije početka" "$(ap $RA $DA 13:00 12:00)" "violates check"
has "termin u tuđe ime je odbijen" "$(as $RA "insert into appointments (clinic_id,patient_id,doctor_id,starts_at,ends_at,service,created_by) values ('$CA','$PT1','$DA','2030-03-05 09:00+01','2030-03-05 09:30+01','X','$OA')")" "row-level security"
eq "termin se potvrđuje" "$(as $RA "update appointments set status='potvrdjen' where id='$A1' returning status" | sed -n 3p)" "potvrdjen"
eq "otkazivanje termina" "$(as $RA "update appointments set status='otkazan' where id='$A1' returning 1" | grep -c '^1$')" "1"
eq "otkazani termin oslobađa vrijeme" "$(ap $DA $DA 10:00 10:30 | grep -c '^[0-9a-f-]\{36\}$')" "1"
has "termin se ne prebacuje drugom pacijentu" "$(as $RA "update appointments set patient_id='$PT2' where id='$A1'")" "premjestiti"
has "autor termina se ne može promijeniti" "$(as $OA "update appointments set created_by='$OA' where id='$A1'")" "ne može mijenjati"
has "termin se ne može obrisati" "$(as $OA "delete from appointments where id='$A1'")" "permission denied"
eq "pacijent ne vidi termine" "$(as $P1 "select count(*) from appointments" | tail -1)" "0"
eq "vlasnik B ne vidi termine ordinacije A" "$(as $OB "select count(*) from appointments" | tail -1)" "0"
eq "stranac ne vidi termine" "$(as $OUT "select count(*) from appointments" | tail -1)" "0"
has "anonimni nema pristup terminima" "$(as anon "select count(*) from appointments")" "permission denied"
eq "recepcija vidi sve termine ordinacije" "$(as $RA "select count(*) from appointments" | tail -1)" "4"
eq "termini su u audit logu" "$(admin "select count(*) > 0 from audit_log where table_name='appointments' and clinic_id='$CA'")" "t"

echo "== Cjenovnik"
svc() { as $1 "insert into services (clinic_id,name,price,duration_min,online) values ('${5:-$CA}','$2',$3,$4,${6:-true}) returning id" | sed -n 3p; }
S1=$(svc $OA "Kompozitni ispun" 80 45); S2=$(svc $OA "Kontrolni pregled" 30 30); S3=$(svc $OA "Izbjeljivanje" 300 60 $CA false)
SB=$(svc $OB "Pregled B" 20 30 $CB)
eq "vlasnik pravi cjenovnik" "$(admin "select count(*) from services where clinic_id='$CA'")" "3"
has "doktor ne mijenja cjenovnik" "$(as $DA "insert into services (clinic_id,name,price) values ('$CA','X',1)")" "row-level security"
eq "recepcija vidi cjenovnik" "$(as $RA "select count(*) from services" | tail -1)" "3"
has "isti naziv usluge je odbijen" "$(as $OA "insert into services (clinic_id,name,price) values ('$CA','kompozitni ispun ',1)")" "services_clinic_name_idx"
has "negativna cijena je odbijena" "$(as $OA "insert into services (clinic_id,name,price) values ('$CA','Y',-5)")" "violates check"
has "usluga se ne briše, nego isključuje" "$(as $OA "delete from services where id='$S3'")" "permission denied"
eq "vlasnik B ne vidi cjenovnik ordinacije A" "$(as $OB "select count(*) from services where clinic_id='$CA'" | tail -1)" "0"
eq "pacijent vidi samo usluge za online zakazivanje" "$(as $P2 "select count(*) from services" | tail -1)" "2"

echo "== Pacijentski nalog"
pinv() { as $1 "insert into clinic_invites (clinic_id,email,role,patient_id) values ('${4:-$CA}','$2','patient','$3') returning token" | sed -n 3p; }
TP=$(pinv $DA pac2@t.ba $PT1)
eq "doktor poziva pacijenta iz kartona" "$(admin "select count(*) from clinic_invites where token='$TP' and invited_by='$DA'")" "1"
eq "recepcija vidi pacijentsku pozivnicu" "$(as $RA "select count(*) from clinic_invites where patient_id='$PT1'" | tail -1)" "1"
eq "doktor vidi samo pacijentske pozivnice" "$(as $DA "select count(*) from clinic_invites" | tail -1)" "1"
has "pozivnica za osoblje iz kartona je odbijena" "$(as $DA "insert into clinic_invites (clinic_id,email,role,patient_id) values ('$CA','x@t.ba','doctor','$PT1')")" "samo pacijentska\|row-level security"
has "pacijentska pozivnica bez kartona je odbijena za osoblje" "$(as $DA "insert into clinic_invites (clinic_id,email,role) values ('$CA','x@t.ba','patient')")" "row-level security"
has "pozivnica za karton druge ordinacije je odbijena" "$(pinv $OB x@t.ba $PT1 $CB)" "ne pripada"
TPD=$(pinv $DA doca@t.ba $PT2)
has "član osoblja ne postaje pacijent iste ordinacije" "$(as $DA "select accept_invite('$TPD')")" "već radi u ordinaciji"
eq "doktor i dalje ima svoju ulogu" "$(as $DA "select my_role('$CA')" | tail -1)" "doctor"
eq "neiskorištena pacijentska pozivnica se povlači" "$(as $RA "delete from clinic_invites where token='$TPD' returning 1" | grep -c '^1$')" "1"
eq "prije povezivanja pacijent ne vidi karton" "$(as $P2 "select count(*) from patients" | tail -1)" "0"
eq "pacijent prihvata pozivnicu" "$(as $P2 "select accept_invite('$TP')" | tail -1)" "$CA"
eq "karton je povezan s nalogom" "$(admin "select user_id from patients where id='$PT1'")" "$P2"
eq "pacijent vidi samo svoj karton" "$(as $P2 "select string_agg(first_name, ',') from patients" | tail -1)" "Ana"
eq "pacijent ne vidi medicinske podatke" "$(as $P2 "select count(*) from patient_medical" | tail -1)" "0"
eq "pacijent ne vidi zapise u kartonu" "$(as $P2 "select count(*) from patient_entries" | tail -1)" "0"
eq "pacijent ne čita tabelu zuba direktno" "$(as $P2 "select count(*) from tooth_status" | tail -1)" "0"
eq "pacijent vidi stanje svojih zuba" "$(as $P2 "select string_agg(tooth || ':' || condition, ',' order by tooth) from my_teeth('$CA')" | tail -1)" "36:krunica,85:nedostaje"
eq "drugi pacijent ne vidi tuđe zube" "$(as $P1 "select count(*) from my_teeth('$CA')" | tail -1)" "0"
eq "stranac ne vidi zube" "$(as $OUT "select count(*) from my_teeth('$CA')" | tail -1)" "0"
has "osoblje ne može ručno povezati nalog s kartonom" "$(as $OA "update patients set user_id='$P1' where id='$PT2'")" "pozivnicom"
has "nov karton se ne može odmah vezati za nalog" "$(as $RA "insert into patients (clinic_id,first_name,last_name,user_id) values ('$CA','X','Y','$P1')")" "row-level security"
TP2=$(pinv $RA pac2@t.ba $PT2)
has "jedan nalog ne dobija dva kartona iste ordinacije" "$(as $P2 "select accept_invite('$TP2')")" "drugim kartonom"
TP3=$(pinv $RA pac1-novi@t.ba $PT1)
has "karton povezan s drugim nalogom se ne preuzima" "$(as $P1 "select accept_invite('$TP3')")" "drugim nalogom"
eq "pacijent ne vidi termine u tabeli" "$(as $P2 "select count(*) from appointments" | tail -1)" "0"
eq "pacijent vidi svoje termine bez internih napomena" "$(as $P2 "select count(*) from my_appointments('$CA')" | tail -1)" "4"
eq "pacijent vidi doktore ordinacije" "$(as $P2 "select string_agg(full_name, ',' order by full_name) from clinic_doctors('$CA')" | tail -1)" "Doktor A,Vlasnik A"
eq "stranac ne vidi doktore ordinacije" "$(as $OUT "select count(*) from clinic_doctors('$CA')" | tail -1)" "0"

echo "== Online zakazivanje"
D2="((current_date + 2) + time"
TZ="at time zone 'Europe/Sarajevo'"
admin "update appointments set status='otkazan' where patient_id='$PT1' and starts_at > '2030-01-01'" >/dev/null
has "zakazivanje je isključeno dok ga vlasnik ne uključi" "$(as $P2 "select count(*) from available_slots('$CA','$DA',current_date + 2,30)")" "nije uključeno"
as $OA "update clinics set online_booking=true, working_hours='{\"0\":[\"08:00\",\"16:00\"],\"1\":[\"08:00\",\"16:00\"],\"2\":[\"08:00\",\"16:00\"],\"3\":[\"08:00\",\"16:00\"],\"4\":[\"08:00\",\"16:00\"],\"5\":[\"08:00\",\"16:00\"],\"6\":[\"08:00\",\"16:00\"]}' where id='$CA'" >/dev/null
SL=$(as $P2 "select count(*) from available_slots('$CA','$DA',current_date + 2,30)" | tail -1)
SLX=16
eq "slobodni termini u radnom vremenu (korak 30 min)" "$SL" "$SLX"
eq "nema termina više od 90 dana unaprijed" "$(as $P2 "select count(*) from available_slots('$CA','$DA',current_date + 91,30)" | tail -1)" "0"
has "recepcija nije doktor za online termine" "$(as $P2 "select count(*) from available_slots('$CA','$RA',current_date + 2,30)")" "ne radi u ovoj"
bk() { as $1 "select book_appointment('$CA','${4:-$DA}','$2',$3,'Boli me zub')"; }
B1=$(bk $P2 $S2 "$D2 '09:00') $TZ" | tail -1)
eq "pacijent zakazuje termin online" "$(admin "select patient_id || '/' || booked_online || '/' || status || '/' || service || '/' || (ends_at - starts_at) from appointments where id='$B1'")" "$PT1/true/zakazan/Kontrolni pregled/00:30:00"
has "isti termin više nije slobodan" "$(bk $P2 $S2 "$D2 '09:00') $TZ")" "nije slobodan"
eq "zauzeto vrijeme nestaje sa spiska" "$(as $P2 "select count(*) from available_slots('$CA','$DA',current_date + 2,30)" | tail -1)" "$((SLX-1))"
has "termin izvan radnog vremena je odbijen" "$(bk $P2 $S2 "$D2 '20:00') $TZ")" "nije slobodan"
has "termin mimo koraka od 30 minuta je odbijen" "$(bk $P2 $S2 "$D2 '10:10') $TZ")" "nije slobodan"
has "usluga koja nije za online je odbijena" "$(bk $P2 $S3 "$D2 '11:00') $TZ")" "ne može zakazati online"
has "usluga druge ordinacije je odbijena" "$(bk $P2 $SB "$D2 '11:00') $TZ")" "ne može zakazati online"
has "pacijent bez kartona ne zakazuje" "$(bk $P1 $S2 "$D2 '11:00') $TZ")" "nije povezan"
has "osoblje ne koristi online zakazivanje" "$(bk $RA $S2 "$D2 '11:00') $TZ")" "za pacijente"
B2=$(bk $P2 $S2 "$D2 '11:00') $TZ" | tail -1); B3=$(bk $P2 $S2 "$D2 '12:00') $TZ" $OA | tail -1)
has "najviše 3 zakazana termina online" "$(bk $P2 $S2 "$D2 '13:00') $TZ")" "Već imate 3"
as $P2 "select confirm_my_appointment('$B1')" >/dev/null
eq "pacijent potvrđuje dolazak" "$(admin "select status from appointments where id='$B1'")" "potvrdjen"
has "drugi pacijent ne dira tuđi termin" "$(as $P1 "select cancel_my_appointment('$B1')")" "ne postoji"
as $P2 "select cancel_my_appointment('$B2')" >/dev/null
eq "pacijent otkazuje termin dovoljno unaprijed" "$(admin "select status from appointments where id='$B2'")" "otkazan"
BS=$(as $RA "insert into appointments (clinic_id,patient_id,doctor_id,starts_at,ends_at,service) values ('$CA','$PT1','$DA',date_trunc('hour', now()) + interval '3 hours',date_trunc('hour', now()) + interval '3 hours 30 minutes','Kontrola') returning id" | sed -n 3p)
has "otkazivanje manje od 24 sata prije ide telefonom" "$(as $P2 "select cancel_my_appointment('$BS')")" "24 sata"

echo "== Plan terapije"
PL1=$(as $DA "insert into treatment_plans (clinic_id,patient_id,title,valid_until) values ('$CA','$PT1','Sanacija zuba',current_date + 30) returning id" | sed -n 3p)
item() { as $1 "insert into plan_items (plan_id,clinic_id,patient_id,service_id,tooth,description,unit_price,qty) values ('$2','$CA','$PT1',$3,$4,'$5',$6,${7:-1}) returning id" | sed -n 3p; }
I1=$(item $DA $PL1 "'$S1'" 36 "Kompozitni ispun" 80); I2=$(item $DA $PL1 "'$S2'" null "Kontrolni pregled" 30 2)
eq "doktor pravi plan sa stavkama" "$(admin "select count(*) from plan_items where plan_id='$PL1'")" "2"
has "plan počinje kao nacrt" "$(as $DA "insert into treatment_plans (clinic_id,patient_id,title,status) values ('$CA','$PT1','X','poslan')")" "nacrt"
has "recepcija ne pravi planove" "$(as $RA "insert into treatment_plans (clinic_id,patient_id,title) values ('$CA','$PT1','X')")" "row-level security"
has "zub 19 u stavci je odbijen" "$(item $DA $PL1 null 19 "X" 1)" "violates check"
has "usluga druge ordinacije u planu je odbijena" "$(item $DA $PL1 "'$SB'" null "X" 1)" "cjenovnika"
has "stavka tuđeg plana je odbijena" "$(as $OB "insert into plan_items (plan_id,clinic_id,patient_id,description,unit_price) values ('$PL1','$CB','$PTB','X',1)")" "ne pripada"
eq "recepcija vidi plan" "$(as $RA "select count(*) from treatment_plans" | tail -1)" "1"
eq "pacijent ne vidi nacrt" "$(as $P2 "select count(*) from treatment_plans" | tail -1)/$(as $P2 "select count(*) from plan_items" | tail -1)" "0/0"
PL0=$(as $DA "insert into treatment_plans (clinic_id,patient_id,title) values ('$CA','$PT1','Prazan') returning id" | sed -n 3p)
has "plan bez stavki se ne šalje" "$(as $DA "update treatment_plans set status='poslan' where id='$PL0'")" "nijednu stavku"
eq "nacrt plana se može obrisati" "$(as $DA "delete from treatment_plans where id='$PL0' returning 1" | grep -c '^1$')" "1"
eq "recepcija ne mijenja plan" "$(as $RA "update treatment_plans set title='Hak' where id='$PL1' returning 1" | grep -c '^1$')" "0"
eq "doktor šalje plan pacijentu" "$(as $DA "update treatment_plans set status='poslan' where id='$PL1' returning sent_at is not null" | sed -n 3p)" "t"
eq "pacijent vidi poslani plan i stavke" "$(as $P2 "select count(*) from treatment_plans" | tail -1)/$(as $P2 "select count(*) from plan_items" | tail -1)" "1/2"
has "stavke poslanog plana se ne mijenjaju" "$(as $DA "update plan_items set unit_price=1 where id='$I1'")" "samo dok je plan nacrt"
eq "stavka poslanog plana se ne briše" "$(as $DA "delete from plan_items where id='$I1' returning 1" | grep -c '^1$')" "0"
has "urađeno se označava tek nakon prihvatanja" "$(as $DA "update plan_items set done_at=now() where id='$I1'")" "prihvaćenog plana"
has "drugi pacijent ne odgovara na tuđi plan" "$(as $P1 "select respond_plan('$PL1', true)")" "ne postoji"
as $P2 "select respond_plan('$PL1', true)" >/dev/null
eq "pacijent prihvata plan u aplikaciji" "$(admin "select status || '/' || responded_by from treatment_plans where id='$PL1'")" "prihvacen/$P2"
has "na plan se odgovara samo jednom" "$(as $P2 "select respond_plan('$PL1', false)")" "već odgovoreno"
has "popust prihvaćenog plana se ne mijenja" "$(as $DA "update treatment_plans set discount_pct=50 where id='$PL1'")" "Prihvaćeni plan"
has "prihvaćeni plan se ne vraća u nacrt" "$(as $DA "update treatment_plans set status='nacrt' where id='$PL1'")" "ne može preći"
eq "pacijent ne mijenja plan direktno" "$(as $P2 "update treatment_plans set status='zavrsen' where id='$PL1' returning 1" | grep -c '^1$')" "0"
has "vrijeme slanja upisuje baza" "$(as $DA "update treatment_plans set sent_at='2000-01-01' where id='$PL1' returning sent_at::date" | sed -n 3p)" "$(date +%Y)"
eq "doktor označava stavku urađenom" "$(as $DA "update plan_items set done_at=now() where id='$I1' returning done_by" | sed -n 3p)" "$DA"
eq "stanje: urađeno, uplaćeno, dug" "$(as $RA "select charged || '/' || paid || '/' || balance from patient_balances where patient_id='$PT1'" | tail -1)" "80.00/0.00/80.00"

echo "== Uplate"
pay() { as $1 "insert into payments (clinic_id,patient_id,plan_id,amount,method) values ('$CA','${4:-$PT1}',$3,$2,'gotovina') returning id" | sed -n 3p; }
PY1=$(pay $RA 50 "'$PL1'")
eq "recepcija upisuje uplatu" "$(admin "select amount || '/' || created_by from payments where id='$PY1'")" "50.00/$RA"
has "uplata u tuđe ime je odbijena" "$(as $RA "insert into payments (clinic_id,patient_id,amount,created_by) values ('$CA','$PT1',5,'$OA')")" "row-level security"
has "uplata od 0 KM je odbijena" "$(pay $RA 0 null)" "violates check"
has "uplata na plan drugog pacijenta je odbijena" "$(pay $RA 10 "'$PL1'" $PT2)" "ne pripada ovom pacijentu"
eq "stanje nakon uplate" "$(as $OA "select charged || '/' || paid || '/' || balance from patient_balances where patient_id='$PT1'" | tail -1)" "80.00/50.00/30.00"
eq "pacijent vidi samo svoje stanje" "$(as $P2 "select count(*) || '/' || max(balance) from patient_balances" | tail -1)" "1/30.00"
eq "pacijent vidi svoju uplatu" "$(as $P2 "select count(*) from payments" | tail -1)" "1"
has "pacijent ne upisuje uplate" "$(as $P2 "insert into payments (clinic_id,patient_id,amount) values ('$CA','$PT1',5)")" "row-level security"
has "uplata se ne mijenja" "$(as $RA "update payments set amount=5 where id='$PY1'")" "samo stornirati"
has "storno traži razlog" "$(as $RA "update payments set voided_at=now() where id='$PY1'")" "razlog"
eq "storno ne radi neko ko nije upisao uplatu" "$(as $DA "update payments set void_reason='x' where id='$PY1' returning 1" | grep -c '^1$')" "0"
eq "recepcija stornira svoju uplatu" "$(as $RA "update payments set void_reason='Pogrešan iznos' where id='$PY1' returning voided_by" | sed -n 3p)" "$RA"
has "stornirana uplata se ne vraća" "$(as $OA "update payments set void_reason='y' where id='$PY1'")" "već stornirana"
eq "storno vraća dug" "$(as $RA "select balance from patient_balances where patient_id='$PT1'" | tail -1)" "80.00"
eq "pacijent ne vidi storniranu uplatu" "$(as $P2 "select count(*) from payments" | tail -1)" "0"
has "uplata se ne briše" "$(as $OA "delete from payments where id='$PY1'")" "permission denied"
eq "vlasnik B ne vidi uplate ordinacije A" "$(as $OB "select count(*) from payments" | tail -1)" "0"
PL2=$(as $DA "insert into treatment_plans (clinic_id,patient_id,title,discount_pct) values ('$CA','$PT1','Izbjeljivanje',10) returning id" | sed -n 3p)
I3=$(item $DA $PL2 "'$S3'" null "Izbjeljivanje" 100)
as $DA "update treatment_plans set status='prihvacen' where id='$PL2'" >/dev/null
as $DA "update plan_items set done_at=now() where id='$I3'" >/dev/null
eq "prihvaćeno u ordinaciji, s popustom od 10%" "$(as $RA "select charged from patient_balances where patient_id='$PT1'" | tail -1)" "170.00"
eq "cjenovnik, planovi i uplate su u audit logu" "$(admin "select count(distinct table_name) from audit_log where clinic_id='$CA' and table_name in ('services','treatment_plans','plan_items','payments')")" "4"

echo "== Novosti i savjeti"
PO1=$(as $DA "insert into clinic_posts (clinic_id,kind,title,body) values ('$CA','savjet','Kako prati zube','Dva puta dnevno po dvije minute.') returning id" | sed -n 3p)
has "recepcija ne piše objave" "$(as $RA "insert into clinic_posts (clinic_id,kind,title,body) values ('$CA','novost','X','Y')")" "row-level security"
eq "pacijent ne vidi neobjavljeno" "$(as $P2 "select count(*) from clinic_posts" | tail -1)" "0"
eq "objava dobija vrijeme objave" "$(as $DA "update clinic_posts set is_published=true where id='$PO1' returning published_at is not null" | sed -n 3p)" "t"
eq "pacijent vidi objavljeni savjet" "$(as $P2 "select count(*) from clinic_posts" | tail -1)" "1"
PO2=$(as $OA "insert into clinic_posts (clinic_id,kind,title,body,valid_until,is_published) values ('$CA','novost','Popust','10% popusta',current_date - 1,true) returning id" | sed -n 3p)
eq "istekla novost se pacijentu ne prikazuje" "$(as $P2 "select count(*) from clinic_posts where kind='novost'" | tail -1)" "0"
eq "osoblje vidi i isteklu novost" "$(as $RA "select count(*) from clinic_posts" | tail -1)" "2"
eq "vlasnik B ne vidi objave ordinacije A" "$(as $OB "select count(*) from clinic_posts" | tail -1)" "0"
eq "stranac ne vidi objave" "$(as $OUT "select count(*) from clinic_posts" | tail -1)" "0"
has "pacijent ne piše objave" "$(as $P2 "insert into clinic_posts (clinic_id,kind,title,body) values ('$CA','novost','X','Y')")" "row-level security"
eq "doktor ne briše tuđu objavu" "$(as $DA "delete from clinic_posts where id='$PO2' returning 1" | grep -c '^1$')" "0"
has "autor objave se ne mijenja" "$(as $OA "update clinic_posts set created_by='$OA' where id='$PO1'")" "ne može mijenjati"
eq "vlasnik briše objavu" "$(as $OA "delete from clinic_posts where id='$PO2' returning 1" | grep -c '^1$')" "1"

echo "== Postavke ordinacije"
has "radno vrijeme koje završava prije početka je odbijeno" "$(as $OA "update clinics set working_hours='{\"1\":[\"16:00\",\"08:00\"]}' where id='$CA'")" "violates check"
has "nepoznat dan u radnom vremenu je odbijen" "$(as $OA "update clinics set working_hours='{\"9\":[\"08:00\",\"16:00\"]}' where id='$CA'")" "violates check"
has "nepoznata valuta je odbijena" "$(as $OA "update clinics set currency='USD' where id='$CA'")" "violates check"
has "nepoznata vremenska zona je odbijena" "$(as $OA "update clinics set timezone='Mars/Baza' where id='$CA'")" "violates check"
eq "doktor ne uključuje online zakazivanje" "$(as $DA "update clinics set online_booking=false where id='$CA' returning 1" | grep -c '^1$')" "0"

echo "== Slike"
up() { as $1 "insert into storage.objects (bucket_id,name) values ('media','$2') returning 1"; }
eq "vlasnik postavlja logo" "$(up $OA "clinics/$CA/logo/logo-abc123.png" | grep -c '^1$')" "1"
has "doktor ne mijenja logo" "$(up $DA "clinics/$CA/logo/logo-def456.png")" "row-level security"
eq "doktor postavlja sliku objave" "$(up $DA "clinics/$CA/posts/post-abc123.jpg" | grep -c '^1$')" "1"
has "recepcija ne postavlja slike objava" "$(up $RA "clinics/$CA/posts/post-def456.jpg")" "row-level security"
has "vlasnik B ne postavlja logo ordinacije A" "$(up $OB "clinics/$CA/logo/logo-ghi789.png")" "row-level security"
eq "pacijent postavlja svoju sliku profila" "$(up $P2 "users/$P2/avatar-abc123.jpg" | grep -c '^1$')" "1"
has "slika se ne postavlja u tuđi folder" "$(up $P2 "users/$DA/avatar-abc123.jpg")" "row-level security"
has "fajl koji nije slika je odbijen" "$(up $P2 "users/$P2/skripta-abc123.html")" "row-level security"
has "anonimni ne postavlja slike" "$(as anon "insert into storage.objects (bucket_id,name) values ('media','users/x/abcdefgh.jpg')")" "permission denied\|row-level security"

echo "== Lični savjeti i video"
msg() { as $1 "insert into patient_messages (clinic_id,patient_id,kind,title,body,video_url) values ('${4:-$CA}','${3:-$PT1}','savjet','$2','Tekst savjeta',${5:-null}) returning id" | sed -n 3p; }
M1=$(msg $DA "Nakon vađenja" $PT1 $CA "'https://www.youtube.com/watch?v=abc123'")
eq "doktor šalje lični savjet pacijentu" "$(admin "select created_by from patient_messages where id='$M1'")" "$DA"
has "recepcija ne šalje lične savjete" "$(msg $RA "X")" "row-level security"
eq "recepcija ne vidi lične savjete" "$(as $RA "select count(*) from patient_messages" | tail -1)" "0"
eq "pacijent vidi svoj lični savjet" "$(as $P2 "select title from patient_messages" | tail -1)" "Nakon vađenja"
eq "drugi pacijent ne vidi tuđi savjet" "$(as $P1 "select count(*) from patient_messages" | tail -1)" "0"
eq "vlasnik B ne vidi savjete ordinacije A" "$(as $OB "select count(*) from patient_messages" | tail -1)" "0"
eq "stranac ne vidi savjete" "$(as $OUT "select count(*) from patient_messages" | tail -1)" "0"
has "pacijent ne mijenja poruku direktno" "$(as $P2 "update patient_messages set title='x' where id='$M1'")" "permission denied"
has "drugi pacijent ne označava tuđu poruku" "$(as $P1 "select mark_message_read('$M1')")" "ne postoji"
as $P2 "select mark_message_read('$M1')" >/dev/null
eq "pacijent označava poruku pročitanom" "$(admin "select read_at is not null from patient_messages where id='$M1'")" "t"
has "poslana poruka se ne mijenja ni u bazi" "$(admin "update patient_messages set title='Drugo' where id='$M1'")" "ne mijenja"
has "video mora biti https link" "$(msg $DA "Y" $PT1 $CA "'javascript:alert(1)'")" "violates check"
has "savjet za karton druge ordinacije je odbijen" "$(msg $DA "Z" $PTB $CA)" "ne pripada"
has "objava ne prima video bez https" "$(as $DA "update clinic_posts set video_url='http://x.ba/v' where id='$PO1'")" "violates check"
eq "objava prima video link" "$(as $DA "update clinic_posts set video_url='https://youtu.be/abc123' where id='$PO1' returning 1" | grep -c '^1$')" "1"
M2=$(msg $DA "Za brisanje")
eq "vlasnik povlači poslanu poruku" "$(as $OA "delete from patient_messages where id='$M2' returning 1" | grep -c '^1$')" "1"
eq "lični savjeti su u audit logu" "$(admin "select count(*) > 0 from audit_log where table_name='patient_messages'")" "t"

echo "== O doktoru i ordinaciji"
as $DA "update profiles set bio='Doktor stomatologije.', education=E'2014 — Stomatološki fakultet\nKurs estetike', photo_url='https://x.test/d.jpg' where id='$DA'" >/dev/null
eq "doktor sam upisuje biografiju i obrazovanje" "$(admin "select bio from profiles where id='$DA'")" "Doktor stomatologije."
eq "pacijent vidi biografiju doktora" "$(as $P2 "select bio from clinic_doctors('$CA') where user_id='$DA'" | tail -1)" "Doktor stomatologije."
eq "pacijent vidi veću sliku doktora" "$(as $P2 "select photo_url from clinic_doctors('$CA') where user_id='$DA'" | tail -1)" "https://x.test/d.jpg"
as $RA "update profiles set bio='hak' where id='$DA'" >/dev/null
eq "niko ne mijenja tuđu biografiju" "$(admin "select bio from profiles where id='$DA'")" "Doktor stomatologije."
has "biografija ima ograničenu dužinu" "$(as $DA "update profiles set bio=repeat('a',1501) where id='$DA'")" "profiles_about_check"
as $OA "update clinics set about='Ordinacija u Goraždu.', cover_url='https://x.test/c.jpg' where id='$CA'" >/dev/null
eq "vlasnik upisuje opis ordinacije" "$(admin "select about from clinics where id='$CA'")" "Ordinacija u Goraždu."
eq "pacijent vidi opis ordinacije" "$(as $P2 "select about from clinics where id='$CA'" | tail -1)" "Ordinacija u Goraždu."
as $DA "update clinics set about='hak' where id='$CA'" >/dev/null
eq "doktor ne mijenja opis ordinacije" "$(admin "select about from clinics where id='$CA'")" "Ordinacija u Goraždu."
eq "stranac ne vidi doktore ordinacije" "$(as $OUT "select count(*) from clinic_doctors('$CA')" | tail -1)" "0"

echo "== Ukidanje pristupa pacijentu"
has "pacijent ne ukida tuđi pristup" "$(as $P1 "select unlink_patient_account('$PT1')")" "Nemate pravo"
as $RA "select unlink_patient_account('$PT1')" >/dev/null
eq "nakon ukidanja pacijent ne vidi karton, zube ni uplate" "$(as $P2 "select (select count(*) from patients) || '/' || (select count(*) from my_teeth('$CA')) || '/' || (select count(*) from treatment_plans)" | tail -1)" "0/0/0"
eq "karton ostaje, bez naloga" "$(admin "select count(*) from patients where id='$PT1' and user_id is null")" "1"

echo "== Zaštite"
has "vlasnik ne može ručno učlaniti tuđi nalog" "$(as $OA "insert into clinic_members (clinic_id,user_id,role) values ('$CA','$OUT','patient')")" "row-level security"
has "članstvo se ne može preseliti na drugog korisnika" "$(as $OA "update clinic_members set user_id='$OUT' where user_id='$P2'")" "ne mogu mijenjati"
has "vlasnik ne može sam aktivirati pretplatu" "$(as $OA "update clinics set status='active' where id='$CA'")" "administrator platforme"
has "vlasnik ne može produžiti probni period" "$(as $OA "update clinics set trial_ends_at = now() + interval '10 years' where id='$CA'")" "administrator platforme"
eq "vlasnik mijenja naziv i boje" "$(as $OA "update clinics set name='N Dental', accent_color='#C8642A' where id='$CA' returning 1" | grep -c '^1$')" "1"
has "neispravna boja je odbijena" "$(as $OA "update clinics set accent_color='narandzasta' where id='$CA'")" "violates check"
has "niko ne može sebi dati Super Admina" "$(as $OA "insert into platform_admins (user_id) values ('$OA')")" "row-level security"
has "jedini vlasnik ne može sebe deaktivirati" "$(as $OA "update clinic_members set is_active=false where user_id='$OA'")" "aktivnog vlasnika"
has "jedini vlasnik ne može sebe ukloniti" "$(as $OA "delete from clinic_members where user_id='$OA'")" "aktivnog vlasnika"
eq "vlasnik deaktivira člana" "$(as $OA "update clinic_members set is_active=false where user_id='$RA' returning 1" | grep -c '^1$')" "1"
eq "deaktivirana recepcija više ne vidi ordinaciju" "$(as $RA "select count(*) from clinics" | tail -1)" "0"
eq "vlasnik i dalje vidi profil deaktiviranog člana" "$(as $OA "select count(*) from profiles where id='$RA'" | tail -1)" "1"
eq "deaktivirana recepcija više ne vidi kartone" "$(as $RA "select count(*) from patients" | tail -1)" "0"
eq "deaktivirana recepcija više ne vidi termine" "$(as $RA "select count(*) from appointments" | tail -1)" "0"
eq "deaktivirana recepcija više ne vidi pacijente" "$(as $RA "select count(*) from profiles where id in ('$P1','$P2')" | tail -1)" "0"
has "nalog koji je član se ne može obrisati" "$(admin "delete from auth.users where id='$DA'")" "violates foreign key"

echo "== Audit log"
eq "vlasnik A vidi samo zapise svoje ordinacije" "$(as $OA "select count(*) from audit_log where clinic_id <> '$CA'" | tail -1)" "0"
eq "izmjena naziva je zabilježena s autorom" "$(admin "select count(*) from audit_log where table_name='clinics' and action='UPDATE' and actor_id='$OA' and new_data->>'name'='N Dental'")" "1"
eq "audit log se ne može mijenjati" "$(as $OA "update audit_log set action='X' returning 1" | grep -c '^1$')" "0"
eq "audit log se ne može brisati" "$(as $OA "delete from audit_log returning 1" | grep -c '^1$')" "0"
has "u audit log se ne može ručno upisati" "$(as $OA "insert into audit_log (action,table_name) values ('X','y')")" "row-level security"

echo "== Super Admin"
eq "Super Admin vidi sve ordinacije" "$(as $ADMIN "select count(*) from clinics" | tail -1)" "2"
eq "Super Admin aktivira pretplatu" "$(as $ADMIN "update clinics set status='active' where id='$CA' returning 1" | grep -c '^1$')" "1"
eq "Super Admin suspenduje ordinaciju" "$(as $ADMIN "update clinics set status='suspended' where id='$CB' returning 1" | grep -c '^1$')" "1"
eq "nakon aktivacije vlasnik smije novu probnu" "$(as $OA "select register_clinic('Druga lokacija')" | grep -c '^[0-9a-f-]\{36\}$')" "1"

echo "== Učvršćene dozvole"
has "trigger funkcija se ne može zvati direktno" "$(as $OA "select audit_row()")" "permission denied"
has "anonimni ne može zvati provjere uloga" "$(as anon "select is_super_admin()")" "permission denied"
eq "prijavljeni i dalje može provjeriti svoju ulogu" "$(as $OA "select my_role('$CA')" | tail -1)" "owner"
eq "audit se i dalje piše nakon učvršćivanja" "$(admin "select (count(*) > 10)::text from audit_log")" "true"

echo "== Brisanje ordinacije (SQL Editor)"
admin "delete from clinics where id='$CB'" >/dev/null
eq "ordinacija B i članstva su obrisani" "$(admin "select count(*) from clinic_members where clinic_id='$CB'")" "0"
eq "audit zapisi obrisane ordinacije su sačuvani" "$(admin "select (count(*) > 0)::text from audit_log where clinic_id='$CB'")" "true"

echo; echo "REZULTAT: $PASS prošlo, $FAIL palo"

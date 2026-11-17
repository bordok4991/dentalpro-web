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

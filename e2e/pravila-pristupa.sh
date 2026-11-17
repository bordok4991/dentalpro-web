#!/bin/bash
# Traži praznu bazu dp_test sa šemom: e2e/shim.sql, pa db/01-temelj.sql i db/02-profili.sql.
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

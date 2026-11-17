# Dental Pro — web panel

Softver za stomatološke ordinacije: panel za osoblje (prijava, ordinacija, tim, karton, zubna šema, kalendar, cjenovnik, planovi terapije s ponudom, finansije, novosti i savjeti) i aplikacija za pacijente u pregledniku telefona, s online zakazivanjem.

## Šta radi

- Prijava, novi nalog, zaboravljena lozinka.
- Registracija ordinacije (vlasnik, probni period 14 dana).
- Tim: pozivnica linkom, uloge (vlasnik, doktor, specijalista, asistent, recepcija), slike članova, deaktiviranje i uklanjanje. Pacijenti se pozivaju iz kartona.
- Postavke: profil sa slikom, jezik (bosanski, hrvatski, srpski, engleski), podaci, logo, boje i valuta ordinacije, radno vrijeme i online zakazivanje.
- Pacijent vidi samo svoju ordinaciju i svoj profil.
- Pacijenti: kartoteka s pretragom (bez kvačica, i po broju kartona), novi pacijent, arhiviranje umjesto brisanja.
- Karton: alergije na vrhu, zubna šema po FDI (stalni i mliječni zubi) s brojem zapisa po zubu, historija zapisa (datum, zub, dijagnoza, urađeno, napomena, autor), ispravka zapisa (autor ili vlasnik), medicinski i lični podaci.
- Zubna šema s pravim oblicima zuba: stanje cijelog zuba (zdrav, nedostaje, krunica, implantat, liječen kanal) i pet površina (karijes, ispun, planirano). Upis vide i mijenjaju samo kliničko osoblje.
- Kalendar: dan po doktorima, novi termin iz kartona, izmjena, statusi (zakazan, potvrđen, stigao, u stolici, završen, nije došao, otkazan). Baza ne dozvoljava dva termina istog doktora u isto vrijeme.
- Recepcija vidi lične podatke i kontakt, ali ne i medicinske podatke ni historiju. Administrator platforme ne vidi pacijente.
- Cjenovnik: usluge s cijenom i trajanjem; mijenja vlasnik. Usluga može biti ponuđena za online zakazivanje.
- Plan terapije: stavke iz cjenovnika ili ručno, zub, količina, popust, rok važenja. Nacrt → poslan pacijentu → prihvaćen ili odbijen → završen. Ponuda za štampu i PDF (dijalog za štampu preglednika). Prihvaćeni plan se ne mijenja; urađene stavke se označavaju.
- Finansije: uplate (gotovina, kartica, prenos) po mjesecima, storniranje s razlogom (uplata se ne briše), dug po pacijentu = urađeno iz prihvaćenih planova minus uplate. Nije fiskalni račun.
- Novosti i savjeti: objave za pacijente (popusti s rokom, savjeti doktora), predlošci koje doktor pregleda prije objave; dijelovi u [zagradama] blokiraju objavu dok se ne popune.
- Aplikacija za pacijente (isti sajt, prijava pacijentskim nalogom): sljedeći termin, potvrda dolaska i otkazivanje (najkasnije 24 h prije), online zakazivanje u slobodnim terminima, stanje zuba (samo za čitanje, bez bilješki doktora), planovi s prihvatanjem, uplate i dug, novosti i savjeti, kontakt ordinacije. Može se dodati na početni ekran telefona.
- Pacijentski nalog se veže za karton samo pozivnicom iz kartona (link, email ili QR kod). Osoblje može ukinuti pristup.
- Slike (logo, slika doktora, slike objava) idu u javni Supabase Storage bucket `media`; upis dozvoljavaju pravila u bazi.

## Pokretanje

```
npm install
npm run dev      # razvoj, http://localhost:5173
npm run build    # izgrađena verzija u dist/
```

Fajl `.env` sadrži adresu Supabase projekta i javni (publishable) ključ. Taj ključ smije biti u aplikaciji: podatke štite pravila pristupa u bazi.

## Baza

`db/01-temelj.sql` do `db/05-ponude-finansije-pacijenti.sql` se primjenjuju redom na Supabase projekat „Dental Pro". Skripte se mogu pokrenuti više puta. Svaka nova tabela mora imati uključen RLS, audit triger i oduzete dozvole anonimnoj ulozi.

## Objava

Izgrađeni `dist/` je običan statički sajt (radi na Netlify, Vercel, Cloudflare Pages). Preusmjeravanje svih adresa na `index.html` je već podešeno (`public/_redirects`, `vercel.json`).

Nakon objave, u Supabase → Authentication → URL Configuration upisati adresu sajta kao Site URL i dodati je u Redirect URLs. Bez toga linkovi iz emailova (potvrda naloga, nova lozinka) vode na pogrešnu adresu.

## Testovi

- `e2e/pravila-pristupa.sh`: 270 provjera pravila pristupa direktno nad bazom.
- `e2e/up.sh` pa `node e2e/flow.cjs`: 130 provjera kroz pravi preglednik u širini telefona, uključujući aplikaciju za pacijente.

Testovi rade nad lokalnim Postgresom i PostgREST-om sa istom šemom. Prijavu i postavljanje slika u testu obrađuje `e2e/server.mjs`, zamjena za Supabase Auth i Storage (upis slike ide kroz ista pravila pristupa u bazi), pa prava registracija emailom nije pokrivena ovim testovima.

# Dental Pro — web panel

Softver za stomatološke ordinacije. Ovaj dio pokriva fazu 1 (prijava, registracija ordinacije, tim s pozivnicama, postavke) i fazu 2 (karton pacijenta).

## Šta radi

- Prijava, novi nalog, zaboravljena lozinka.
- Registracija ordinacije (vlasnik, probni period 14 dana).
- Tim: pozivnica linkom, uloge (vlasnik, doktor, specijalista, asistent, recepcija, pacijent), deaktiviranje i uklanjanje članova.
- Postavke: profil, jezik (bosanski, hrvatski, srpski, engleski), podaci i boje ordinacije.
- Pacijent vidi samo svoju ordinaciju i svoj profil.
- Pacijenti: kartoteka s pretragom (bez kvačica, i po broju kartona), novi pacijent, arhiviranje umjesto brisanja.
- Karton: alergije na vrhu, zubna šema po FDI (stalni i mliječni zubi) s brojem zapisa po zubu, historija zapisa (datum, zub, dijagnoza, urađeno, napomena, autor), ispravka zapisa (autor ili vlasnik), medicinski i lični podaci.
- Recepcija vidi lične podatke i kontakt, ali ne i medicinske podatke ni historiju. Administrator platforme ne vidi pacijente.

## Pokretanje

```
npm install
npm run dev      # razvoj, http://localhost:5173
npm run build    # izgrađena verzija u dist/
```

Fajl `.env` sadrži adresu Supabase projekta i javni (publishable) ključ. Taj ključ smije biti u aplikaciji: podatke štite pravila pristupa u bazi.

## Baza

`db/01-temelj.sql`, `db/02-profili.sql` i `db/03-pacijenti.sql` su već primijenjeni na Supabase projekat „Dental Pro". Skripte se mogu pokrenuti više puta. Svaka nova tabela mora imati uključen RLS, audit triger i oduzete dozvole anonimnoj ulozi.

## Objava

Izgrađeni `dist/` je običan statički sajt (radi na Netlify, Vercel, Cloudflare Pages). Preusmjeravanje svih adresa na `index.html` je već podešeno (`public/_redirects`, `vercel.json`).

Nakon objave, u Supabase → Authentication → URL Configuration upisati adresu sajta kao Site URL i dodati je u Redirect URLs. Bez toga linkovi iz emailova (potvrda naloga, nova lozinka) vode na pogrešnu adresu.

## Testovi

- `e2e/pravila-pristupa.sh`: 107 provjera pravila pristupa direktno nad bazom.
- `e2e/up.sh` pa `node e2e/flow.cjs`: 72 provjere kroz pravi preglednik u širini telefona.

Testovi rade nad lokalnim Postgresom i PostgREST-om sa istom šemom. Prijavu u testu izdaje `e2e/server.mjs`, zamjena za Supabase Auth, pa prava registracija emailom nije pokrivena ovim testovima.

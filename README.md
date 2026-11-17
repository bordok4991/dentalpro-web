# Dental Pro — web panel

Softver za stomatološke ordinacije. Ovaj dio pokriva fazu 1 (prijava, registracija ordinacije, tim s pozivnicama, postavke) fazu 2 (karton pacijenta), zubnu šemu s pravim zubima i kalendar termina.

## Šta radi

- Prijava, novi nalog, zaboravljena lozinka.
- Registracija ordinacije (vlasnik, probni period 14 dana).
- Tim: pozivnica linkom, uloge (vlasnik, doktor, specijalista, asistent, recepcija, pacijent), deaktiviranje i uklanjanje članova.
- Postavke: profil, jezik (bosanski, hrvatski, srpski, engleski), podaci i boje ordinacije.
- Pacijent vidi samo svoju ordinaciju i svoj profil.
- Pacijenti: kartoteka s pretragom (bez kvačica, i po broju kartona), novi pacijent, arhiviranje umjesto brisanja.
- Karton: alergije na vrhu, zubna šema po FDI (stalni i mliječni zubi) s brojem zapisa po zubu, historija zapisa (datum, zub, dijagnoza, urađeno, napomena, autor), ispravka zapisa (autor ili vlasnik), medicinski i lični podaci.
- Zubna šema s pravim oblicima zuba: stanje cijelog zuba (zdrav, nedostaje, krunica, implantat, liječen kanal) i pet površina (karijes, ispun, planirano). Upis vide i mijenjaju samo kliničko osoblje.
- Kalendar: dan po doktorima, novi termin iz kartona, izmjena, statusi (zakazan, potvrđen, stigao, u stolici, završen, nije došao, otkazan). Baza ne dozvoljava dva termina istog doktora u isto vrijeme.
- Recepcija vidi lične podatke i kontakt, ali ne i medicinske podatke ni historiju. Administrator platforme ne vidi pacijente.

## Pokretanje

```
npm install
npm run dev      # razvoj, http://localhost:5173
npm run build    # izgrađena verzija u dist/
```

Fajl `.env` sadrži adresu Supabase projekta i javni (publishable) ključ. Taj ključ smije biti u aplikaciji: podatke štite pravila pristupa u bazi.

## Baza

`db/01-temelj.sql` do `db/04-zubi-termini.sql` su već primijenjeni na Supabase projekat „Dental Pro". Skripte se mogu pokrenuti više puta. Svaka nova tabela mora imati uključen RLS, audit triger i oduzete dozvole anonimnoj ulozi.

## Objava

Izgrađeni `dist/` je običan statički sajt (radi na Netlify, Vercel, Cloudflare Pages). Preusmjeravanje svih adresa na `index.html` je već podešeno (`public/_redirects`, `vercel.json`).

Nakon objave, u Supabase → Authentication → URL Configuration upisati adresu sajta kao Site URL i dodati je u Redirect URLs. Bez toga linkovi iz emailova (potvrda naloga, nova lozinka) vode na pogrešnu adresu.

## Testovi

- `e2e/pravila-pristupa.sh`: 144 provjere pravila pristupa direktno nad bazom.
- `e2e/up.sh` pa `node e2e/flow.cjs`: 85 provjera kroz pravi preglednik u širini telefona.

Testovi rade nad lokalnim Postgresom i PostgREST-om sa istom šemom. Prijavu u testu izdaje `e2e/server.mjs`, zamjena za Supabase Auth, pa prava registracija emailom nije pokrivena ovim testovima.

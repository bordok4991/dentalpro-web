// Prolazak cijelog toka kroz pravi preglednik (Chromium), u širini telefona.
const { chromium } = require('playwright');
const path = require('path');
const BASE = 'http://localhost:54321';
const SHOTS = path.join(__dirname, 'shots');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${name}${cond ? '' : ' -> ' + extra}`); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function newPage(viewport = { width: 390, height: 844 }) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'bs-BA' });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    return page;
  }
  const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true });
  const text = (page) => page.locator('body').innerText();
  const has = async (page, s) => (await text(page)).includes(s);
  const waitText = (page, s) => page.getByText(s, { exact: false }).first().waitFor({ timeout: 8000 });

  async function register(page, { name, email, password = 'lozinka123' }) {
    await page.goto(BASE + '/register');
    await page.getByLabel('Ime i prezime').fill(name);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Lozinka').fill(password);
    await page.getByRole('button', { name: 'Napravi nalog' }).click();
  }
  async function login(page, email, password = 'lozinka123') {
    await page.goto(BASE + '/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Lozinka').fill(password);
    await page.getByRole('button', { name: 'Prijavi se' }).click();
  }
  async function logout(page) {
    await page.getByRole('button', { name: 'Odjavi se' }).click();
    await page.waitForURL('**/login');
  }

  console.log('== Prijava');
  const page = await newPage();
  await page.goto(BASE + '/');
  await page.waitForURL('**/login');
  ok('neprijavljen korisnik ide na prijavu', true);
  ok('zubna šema ima 32 zuba', (await page.locator('.fdi-tooth').count()) === 32);
  await shot(page, '01-prijava');
  await page.getByLabel('Email', { exact: true }).fill('niko@example.test');
  await page.getByLabel('Lozinka').fill('pogresna123');
  await page.getByRole('button', { name: 'Prijavi se' }).click();
  await waitText(page, 'Email ili lozinka nisu tačni.');
  ok('pogrešna lozinka daje jasnu poruku', true);
  await page.goto(BASE + '/register');
  await page.getByLabel('Ime i prezime').fill('Kratka Lozinka');
  await page.getByLabel('Email', { exact: true }).fill('kratka@example.test');
  await page.getByLabel('Lozinka').fill('abc');
  await page.getByRole('button', { name: 'Napravi nalog' }).click();
  await waitText(page, 'Lozinka mora imati najmanje 8 znakova.');
  ok('prekratka lozinka je odbijena prije slanja', true);

  console.log('== Registracija vlasnika i ordinacije');
  await register(page, { name: 'Selma Kovač', email: 'vlasnik@example.test' });
  await waitText(page, 'Dobro došli, Selma');
  ok('novi nalog vidi ekran dobrodošlice', true);
  await shot(page, '02-dobrodosli');
  await page.getByRole('button', { name: 'Registruj ordinaciju' }).click();
  ok('prazan naziv ordinacije nije poslan', new URL(page.url()).pathname === '/' && (await has(page, 'Dobro došli, Selma')) && !(await has(page, 'Dobar dan')));
  await page.getByLabel('Naziv ordinacije').fill('Demo Dental');
  await page.getByLabel('Grad').fill('Sarajevo');
  await page.getByRole('button', { name: 'Registruj ordinaciju' }).click();
  await waitText(page, 'Dobar dan, Selma');
  ok('ordinacija je registrovana, vlasnik vidi pregled', await has(page, 'Tvoja uloga: Vlasnik'));
  ok('probni period pokazuje 14 dana', await has(page, 'Ističe') && !(await has(page, '..')) && await has(page, 'Preostalo: 14 dana'), await text(page));
  await waitText(page, 'Aktivnih članova: 1');
  ok('pregled broji članove iz baze', true);
  await shot(page, '03-pregled');

  console.log('== Postavke ordinacije');
  await page.locator('.shell-nav').getByRole('link', { name: 'Postavke', exact: true }).click();
  await page.getByLabel('Adresa').fill('Titova 12');
  await page.getByLabel('Telefon ordinacije').fill('+387 33 123 456');
  await page.getByLabel('Boja isticanja (#RRGGBB)').fill('zelena');
  await page.getByRole('button', { name: 'Sačuvaj ordinaciju' }).click();
  await waitText(page, 'Boja mora biti u obliku #RRGGBB.');
  ok('neispravna boja je odbijena', true);
  await page.getByLabel('Boja isticanja (#RRGGBB)').fill('#C8642A');
  await page.getByLabel('Osnovna boja (#RRGGBB)').fill('#123B36');
  await page.getByRole('button', { name: 'Sačuvaj ordinaciju' }).click();
  await waitText(page, 'Podaci ordinacije su sačuvani.');
  ok('podaci ordinacije su sačuvani', true);
  const brand = await page.locator('.shell').evaluate((el) => getComputedStyle(el).getPropertyValue('--brand').trim());
  ok('boje ordinacije se odmah primjenjuju', brand.toUpperCase() === '#123B36', brand);
  await shot(page, '04-postavke');
  await page.reload();
  await page.locator('.shell-nav').getByRole('link', { name: 'Pregled', exact: true }).click();
  await waitText(page, 'Titova 12, Sarajevo');
  ok('izmjene ostaju nakon ponovnog učitavanja', await has(page, '+387 33 123 456'));

  console.log('== Tim i pozivnice');
  await page.locator('.shell-nav').getByRole('link', { name: 'Tim', exact: true }).click();
  await waitText(page, 'Nema pozivnica na čekanju.');
  async function invite(email, role, specialty) {
    await page.getByRole('button', { name: 'Pozovi člana' }).click();
    await page.getByLabel('Email osobe').fill(email);
    await page.getByLabel('Uloga').selectOption(role);
    if (specialty) await page.getByLabel('Specijalnost').fill(specialty);
    await page.getByRole('button', { name: 'Napravi pozivnicu' }).click();
    await waitText(page, 'Pozivnica je spremna.');
    return page.locator('.block-accent input').inputValue();
  }
  await page.getByRole('button', { name: 'Pozovi člana' }).click();
  await page.getByLabel('Email osobe').fill('osoba@ordinacija');
  await page.getByRole('button', { name: 'Napravi pozivnicu' }).click();
  await waitText(page, 'Upiši ispravan email.');
  ok('neispravan email pozivnice je odbijen', true);
  await page.getByRole('button', { name: 'Odustani' }).click();
  const linkDoc = await invite('ortodont@example.test', 'specialist', 'ortodont');
  ok('pozivnica daje link', /\/invite\/[0-9a-f-]{36}$/.test(linkDoc), linkDoc);
  await page.locator('.block-accent').getByRole('button', { name: 'Kopiraj link' }).click();
  await waitText(page, 'Kopirano');
  ok('link se kopira u međuspremnik', (await page.evaluate(() => navigator.clipboard.readText())) === linkDoc);
  await shot(page, '05-tim-pozivnica');
  const linkPat = await invite('pacijent@example.test', 'patient');
  const linkRec = await invite('recepcija@example.test', 'reception');
  ok('tri pozivnice su na čekanju', (await page.locator('.rows').nth(1).locator('.rowitem').count()) === 3);
  await page.locator('.rows').nth(1).locator('.rowitem', { hasText: 'recepcija@example.test' }).getByRole('button', { name: 'Poništi' }).click();
  await page.locator('.rows').nth(1).locator('.rowitem').nth(2).waitFor({ state: 'detached' });
  ok('poništena pozivnica nestaje sa spiska', !(await has(page, 'recepcija@example.test')));
  await logout(page);

  console.log('== Prihvatanje pozivnice');
  await page.goto(linkDoc);
  await page.waitForURL('**/login');
  ok('pozivnica bez prijave vodi na prijavu s napomenom', await has(page, 'Imaš pozivnicu u ordinaciju.'));
  await register(page, { name: 'Emir Begić', email: 'ortodont@example.test' });
  await waitText(page, 'Dobar dan, Emir');
  ok('novi član ulazi u ordinaciju odmah nakon registracije', await has(page, 'Tvoja uloga: Specijalista') && await has(page, 'Demo Dental'));
  await page.locator('.shell-nav').getByRole('link', { name: 'Tim', exact: true }).click();
  await waitText(page, 'Članove može mijenjati samo vlasnik ordinacije.');
  ok('specijalista vidi tim, ali ga ne može mijenjati', (await page.getByRole('button', { name: 'Uredi' }).count()) === 0 && (await page.getByRole('button', { name: 'Pozovi člana' }).count()) === 0);
  ok('specijalista ne vidi pozivnice', !(await has(page, 'Pozivnice na čekanju')));
  await page.locator('.shell-nav').getByRole('link', { name: 'Postavke', exact: true }).click();
  await waitText(page, 'Moj profil');
  ok('specijalista ne može mijenjati podatke ordinacije', await has(page, 'Podatke ordinacije mijenja vlasnik.') && (await page.getByRole('button', { name: 'Sačuvaj ordinaciju' }).count()) === 0);
  await shot(page, '06-specijalista-tim');
  await page.goto(linkDoc);
  await waitText(page, 'Pozivnica je već iskorištena.');
  ok('iskorištena pozivnica se ne može ponoviti', true);
  await page.getByRole('button', { name: 'Odjavi se' }).click();
  await page.waitForURL('**/login');
  ok('iskorištena pozivnica se ne nudi ponovo nakon odjave', !(await has(page, 'Imaš pozivnicu u ordinaciju.')));

  await register(page, { name: 'Neko Drugi', email: 'stranac@example.test' });
  await waitText(page, 'Dobro došli, Neko');
  await page.getByLabel('Link ili kod pozivnice').fill('ovo nije link');
  await page.getByRole('button', { name: 'Pridruži se' }).click();
  await waitText(page, 'To ne izgleda kao pozivnica.');
  ok('besmislen unos pozivnice je odbijen', true);
  await page.getByLabel('Link ili kod pozivnice').fill(linkPat);
  await page.getByRole('button', { name: 'Pridruži se' }).click();
  await waitText(page, 'Pozivnica je poslana na drugi email.');
  ok('tuđa pozivnica je odbijena', true);
  await page.getByRole('button', { name: 'Odjavi se' }).click();
  await page.waitForURL('**/login');
  const kept = await waitText(page, 'Imaš pozivnicu u ordinaciju.').then(() => true, () => false);
  ok('nakon odjave s pogrešnog naloga pozivnica čeka pravi nalog', kept, 'sessionStorage=' + (await page.evaluate(() => sessionStorage.getItem('dp.invite'))) + ' | ' + (await text(page)).slice(0, 200));
  await page.goto(linkRec);
  await page.waitForURL('**/login');
  await register(page, { name: 'Rec Epcija', email: 'recepcija@example.test' });
  await waitText(page, 'Pozivnica ne postoji ili je poništena.');
  ok('poništena pozivnica više ne važi', true);
  await page.getByRole('button', { name: 'Odjavi se' }).click();
  await page.waitForURL('**/login');

  console.log('== Pacijent');
  await page.goto(linkPat);
  await page.waitForURL('**/login');
  await register(page, { name: 'Amina Pacijent', email: 'pacijent@example.test' });
  await waitText(page, 'Tvoja uloga: Pacijent');
  ok('pacijent ulazi u ordinaciju', true);
  ok('pacijent nema stavku Tim', (await page.locator('.shell-nav').getByRole('link', { name: 'Tim', exact: true }).count()) === 0);
  await page.goto(BASE + '/team');
  await waitText(page, 'Tvoja uloga: Pacijent');
  ok('adresa /team pacijenta vraća na pregled', new URL(page.url()).pathname === '/');
  const patientSees = await page.evaluate(async () => {
    const k = Object.keys(localStorage).find((x) => x.endsWith('-auth-token'));
    const tok = JSON.parse(localStorage.getItem(k)).access_token;
    const get = (p) => fetch('/rest/v1/' + p, { headers: { Authorization: 'Bearer ' + tok } }).then((r) => r.json());
    return { members: (await get('clinic_members?select=id')).length, profiles: (await get('profiles?select=id')).length, invites: (await get('clinic_invites?select=id')).length };
  });
  ok('pacijent iz baze dobija samo svoje podatke', patientSees.members === 1 && patientSees.profiles === 1 && patientSees.invites === 0, JSON.stringify(patientSees));
  await shot(page, '07-pacijent');
  await logout(page);

  console.log('== Vlasnik upravlja timom');
  await login(page, 'vlasnik@example.test');
  await waitText(page, 'Aktivnih članova: 3');
  ok('vlasnik vidi 3 aktivna člana i 0 pozivnica', await has(page, 'Pozivnica na čekanju: 0'));
  await page.locator('.shell-nav').getByRole('link', { name: 'Tim', exact: true }).click();
  const rowDoc = page.locator('.rows').first().locator('.rowitem', { hasText: 'Emir Begić' });
  await rowDoc.waitFor();
  ok('vlasnik vidi ime, email i specijalnost člana', (await rowDoc.innerText()).includes('ortodont@example.test') && (await rowDoc.innerText()).includes('Specijalista, ortodont'));
  ok('vlasnik ne može uređivati sam sebe', (await page.locator('.rowitem', { hasText: 'Selma Kovač' }).getByRole('button').count()) === 0);
  await shot(page, '08-tim-vlasnik');
  await rowDoc.getByRole('button', { name: 'Uredi' }).click();
  await rowDoc.getByLabel('Uloga').selectOption('doctor');
  await rowDoc.getByRole('button', { name: 'Sačuvaj' }).click();
  await page.locator('.rowitem', { hasText: 'Doktor, ortodont' }).waitFor();
  ok('promjena uloge je sačuvana', true);
  await rowDoc.getByRole('button', { name: 'Uredi' }).click();
  await shot(page, '09-tim-uredjivanje');
  await rowDoc.getByRole('button', { name: 'Deaktiviraj' }).click();
  await rowDoc.getByText('Deaktiviran').waitFor();
  ok('član je deaktiviran', true);
  const rowPat = page.locator('.rows').first().locator('.rowitem', { hasText: 'Amina Pacijent' });
  await rowPat.getByRole('button', { name: 'Uredi' }).click();
  await rowPat.getByRole('button', { name: 'Ukloni' }).click();
  ok('uklanjanje traži potvrdu', await has(page, 'Uklonjeni član gubi pristup ordinaciji.') && (await rowPat.count()) === 1);
  await rowPat.getByRole('button', { name: 'Potvrdi uklanjanje' }).click();
  await rowPat.waitFor({ state: 'detached' });
  ok('član je uklonjen nakon potvrde', true);
  await logout(page);
  await login(page, 'ortodont@example.test');
  await waitText(page, 'Dobro došli, Emir');
  ok('deaktivirani član više nema pristup ordinaciji', !(await has(page, 'Demo Dental')));
  await page.getByRole('button', { name: 'Odjavi se' }).click();
  await page.waitForURL('**/login');

  console.log('== Jezik, potvrda emaila, nova lozinka');
  await login(page, 'vlasnik@example.test');
  await waitText(page, 'Dobar dan, Selma');
  await page.locator('.shell-nav').getByRole('link', { name: 'Postavke', exact: true }).click();
  await page.getByLabel('Jezik').selectOption('en');
  await page.getByRole('button', { name: 'Sačuvaj profil' }).click();
  await waitText(page, 'Profile saved.');
  ok('promjena jezika se primjenjuje odmah', await has(page, 'Practice details'));
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');
  await page.locator('.lang-select').selectOption('hr');
  await page.goto(BASE + '/login');
  await page.getByLabel('Email', { exact: true }).fill('vlasnik@example.test');
  await page.getByLabel('Lozinka').fill('lozinka123');
  await page.getByRole('button', { name: 'Prijavi se' }).click();
  await waitText(page, 'Hello, Selma');
  ok('jezik iz profila se vraća nakon prijave', await has(page, 'Your role: Owner'));
  await shot(page, '10-engleski');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');
  await page.locator('.lang-select').selectOption('bs');

  await register(page, { name: 'Čeka Potvrdu', email: 'ceka+confirm@example.test' });
  await waitText(page, 'Potvrdi email');
  ok('kad je potvrda emaila uključena, prikazuje se uputa', await has(page, 'ceka+confirm@example.test'));
  await page.goto(BASE + '/register');
  await page.getByLabel('Ime i prezime').fill('Dupli Nalog');
  await page.getByLabel('Email', { exact: true }).fill('vlasnik@example.test');
  await page.getByLabel('Lozinka').fill('lozinka123');
  await page.getByRole('button', { name: 'Napravi nalog' }).click();
  await waitText(page, 'Nalog s ovim emailom već postoji.');
  ok('zauzet email daje jasnu poruku', true);
  await page.goto(BASE + '/forgot');
  await page.getByLabel('Email', { exact: true }).fill('vlasnik@example.test');
  await page.getByRole('button', { name: 'Pošalji link' }).click();
  await waitText(page, 'Ako nalog s tim emailom postoji, link je poslan.');
  ok('zahtjev za novu lozinku je poslan', true);
  await page.goto(BASE + '/reset');
  await waitText(page, 'Ovu stranicu otvara link iz emaila za novu lozinku.');
  ok('stranica za novu lozinku bez linka daje uputu', true);

  console.log('== Izgled');
  const overflow = [];
  for (const [p, who] of [['/login', null], ['/register', null], ['/', 'vlasnik@example.test'], ['/team', 'vlasnik@example.test'], ['/settings', 'vlasnik@example.test']]) {
    if (who && !(await page.evaluate(() => Object.keys(localStorage).some((k) => k.endsWith('-auth-token'))))) { await login(page, who); await page.waitForURL((u) => new URL(u).pathname === '/'); await page.locator('.shell').waitFor(); }
    await page.goto(BASE + p);
    await page.waitForTimeout(500);
    const w = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (w > 0) overflow.push(`${p}: +${w}px`);
  }
  ok('nema vodoravnog pomjeranja na telefonu (390 px)', overflow.length === 0, overflow.join(', '));

  const desk = await newPage({ width: 1280, height: 800 });
  await desk.goto(BASE + '/login');
  await desk.locator('.fdi-tooth').first().waitFor();
  await desk.screenshot({ path: path.join(SHOTS, '11-desktop-prijava.png') });
  await login(desk, 'vlasnik@example.test');
  await desk.locator('.shell').waitFor();
  await desk.locator('.lang-select, [aria-label]').first().waitFor();
  await desk.locator('.shell-nav').getByRole('link', { name: /^(Tim|Team)$/ }).click();
  await desk.locator('.rowitem').first().waitFor();
  await desk.screenshot({ path: path.join(SHOTS, '12-desktop-tim.png') });

  ok('nema grešaka u konzoli preglednika', errors.length === 0, errors.slice(0, 5).join(' | '));
  console.log(`\nREZULTAT: ${pass} prošlo, ${fail} palo`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('PREKID:', e.message.split('\n').slice(0, 6).join('\n')); process.exit(2); });

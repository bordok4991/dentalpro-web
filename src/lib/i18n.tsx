import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LOCALES, type Locale } from './types';

const bs = {
  'app.name': 'Dental Pro',

  'auth.tagline': 'Softver za stomatološke ordinacije.',
  'auth.login': 'Prijava',
  'auth.register': 'Novi nalog',
  'auth.email': 'Email',
  'auth.password': 'Lozinka',
  'auth.passwordHint': 'Najmanje 8 znakova.',
  'auth.fullName': 'Ime i prezime',
  'auth.phoneOptional': 'Telefon (neobavezno)',
  'auth.submitLogin': 'Prijavi se',
  'auth.submitRegister': 'Napravi nalog',
  'auth.forgot': 'Zaboravljena lozinka?',
  'auth.forgotTitle': 'Nova lozinka',
  'auth.forgotLead': 'Upiši email naloga. Poslaćemo ti link za postavljanje nove lozinke.',
  'auth.sendReset': 'Pošalji link',
  'auth.resetSent': 'Ako nalog s tim emailom postoji, link je poslan. Provjeri i neželjenu poštu.',
  'auth.backToLogin': 'Nazad na prijavu',
  'auth.checkEmailTitle': 'Potvrdi email',
  'auth.checkEmail': 'Poslali smo link za potvrdu na {email}. Otvori ga, pa se prijavi.',
  'auth.inviteNotice': 'Imaš pozivnicu u ordinaciju. Prijavi se ili napravi nalog emailom na koji je pozivnica poslana.',
  'auth.newPassword': 'Nova lozinka',
  'auth.saveNewPassword': 'Sačuvaj lozinku',
  'auth.passwordSaved': 'Lozinka je promijenjena.',
  'auth.resetNeedsLink': 'Ovu stranicu otvara link iz emaila za novu lozinku.',

  'fdi.caption': 'Zubna šema po FDI numeraciji',

  'welcome.title': 'Dobro došli, {name}',
  'welcome.titlePlain': 'Dobro došli',
  'welcome.lead': 'Nalog još nije povezan ni s jednom ordinacijom. Registruj svoju ili se pridruži postojećoj.',
  'welcome.registerTitle': 'Registruj ordinaciju',
  'welcome.registerLead': 'Postaješ vlasnik ordinacije. Probni period traje 14 dana.',
  'welcome.submitRegister': 'Registruj ordinaciju',
  'welcome.joinTitle': 'Imam pozivnicu',
  'welcome.joinLead': 'Zalijepi link ili kod koji ti je poslao vlasnik ordinacije.',
  'welcome.inviteField': 'Link ili kod pozivnice',
  'welcome.submitJoin': 'Pridruži se',
  'welcome.badToken': 'To ne izgleda kao pozivnica. Zalijepi cijeli link.',

  'clinic.name': 'Naziv ordinacije',
  'clinic.doctorName': 'Ime doktora',
  'clinic.city': 'Grad',
  'clinic.address': 'Adresa',
  'clinic.phone': 'Telefon ordinacije',
  'clinic.email': 'Email ordinacije',

  'invite.accepting': 'Prihvatam pozivnicu…',
  'invite.failedTitle': 'Pozivnica nije prihvaćena',
  'invite.continue': 'Nastavi',

  'nav.overview': 'Pregled',
  'nav.team': 'Tim',
  'nav.settings': 'Postavke',
  'nav.logout': 'Odjavi se',
  'nav.clinic': 'Ordinacija',

  'role.owner': 'Vlasnik',
  'role.doctor': 'Doktor',
  'role.specialist': 'Specijalista',
  'role.assistant': 'Asistent',
  'role.reception': 'Recepcija',
  'role.patient': 'Pacijent',

  'overview.hello': 'Dobar dan, {name}',
  'overview.helloPlain': 'Dobar dan',
  'overview.yourRole': 'Tvoja uloga: {role}',
  'overview.team': 'Tim',
  'overview.activeMembers': 'Aktivnih članova: {n}',
  'overview.pendingInvites': 'Pozivnica na čekanju: {n}',
  'overview.openTeam': 'Otvori tim',
  'overview.clinic': 'Ordinacija',
  'overview.noContact': 'Kontakt podaci još nisu upisani.',
  'overview.editClinic': 'Uredi podatke',

  'status.trial': 'Probni period',
  'status.active': 'Aktivna pretplata',
  'status.suspended': 'Ordinacija je suspendovana',
  'status.trialLeft': 'Ističe {date}. Preostalo: {days}.',
  'status.trialOver': 'Probni period je istekao {date}.',
  'status.suspendedLead': 'Za ponovno aktiviranje javi se podršci.',
  'days.one': '1 dan',
  'days.many': '{n} dana',

  'team.title': 'Tim',
  'team.lead': 'Ko ima pristup ordinaciji i s kojom ulogom.',
  'team.invite': 'Pozovi člana',
  'team.members': 'Članovi',
  'team.you': 'ti',
  'team.role': 'Uloga',
  'team.specialty': 'Specijalnost',
  'team.specialtyHint': 'npr. ortodont, oralni hirurg',
  'team.inactive': 'Deaktiviran',
  'team.deactivate': 'Deaktiviraj',
  'team.activate': 'Aktiviraj',
  'team.remove': 'Ukloni',
  'team.confirmRemove': 'Potvrdi uklanjanje',
  'team.removeNote': 'Uklonjeni član gubi pristup ordinaciji. Nalog mu ostaje.',
  'team.noName': 'Bez imena',
  'team.invites': 'Pozivnice na čekanju',
  'team.noInvites': 'Nema pozivnica na čekanju.',
  'team.inviteTitle': 'Nova pozivnica',
  'team.inviteLead': 'Osoba se mora prijaviti ovim emailom da bi prihvatila pozivnicu.',
  'team.inviteEmail': 'Email osobe',
  'team.createInvite': 'Napravi pozivnicu',
  'team.inviteReady': 'Pozivnica je spremna. Pošalji ovaj link osobi:',
  'team.copyLink': 'Kopiraj link',
  'team.copied': 'Kopirano',
  'team.revoke': 'Poništi',
  'team.expires': 'Važi još {days}',
  'team.expired': 'Istekla',
  'team.readOnly': 'Članove može mijenjati samo vlasnik ordinacije.',
  'team.editMember': 'Uredi',
  'team.saveMember': 'Sačuvaj',

  'settings.title': 'Postavke',
  'settings.profile': 'Moj profil',
  'settings.language': 'Jezik',
  'settings.loginEmail': 'Email za prijavu',
  'settings.saveProfile': 'Sačuvaj profil',
  'settings.profileSaved': 'Profil je sačuvan.',
  'settings.clinic': 'Podaci ordinacije',
  'settings.clinicLead': 'Naziv, kontakt i boje ordinacije.',
  'settings.primaryColor': 'Osnovna boja',
  'settings.accentColor': 'Boja isticanja',
  'settings.saveClinic': 'Sačuvaj ordinaciju',
  'settings.clinicSaved': 'Podaci ordinacije su sačuvani.',
  'settings.ownerOnly': 'Podatke ordinacije mijenja vlasnik.',

  'nav.patients': 'Pacijenti',

  'patients.title': 'Pacijenti',
  'patients.lead': 'Kartoteka ordinacije.',
  'patients.new': 'Novi pacijent',
  'patients.search': 'Pretraga',
  'patients.searchHint': 'Ime, prezime, telefon ili broj kartona. Kvačice nisu potrebne.',
  'patients.showArchived': 'Prikaži arhivirane',
  'patients.empty': 'Kartoteka je prazna. Dodaj prvog pacijenta.',
  'patients.emptyArchived': 'Nema arhiviranih pacijenata.',
  'patients.noResults': 'Nijedan pacijent ne odgovara pretrazi.',
  'patients.card': 'Karton {n}',
  'patients.archived': 'Arhiviran',
  'patients.more': 'Prikazano je prvih {n}. Suzi pretragu da nađeš ostale.',

  'patient.firstName': 'Ime',
  'patient.lastName': 'Prezime',
  'patient.dob': 'Datum rođenja',
  'patient.sex': 'Spol',
  'patient.sexF': 'Žensko',
  'patient.sexM': 'Muško',
  'patient.sexNone': 'Nije navedeno',
  'patient.phone': 'Telefon',
  'patient.email': 'Email',
  'patient.address': 'Adresa',
  'patient.city': 'Grad',
  'patient.newTitle': 'Novi pacijent',
  'patient.newLead': 'Broj kartona se dodjeljuje sam.',
  'patient.create': 'Sačuvaj pacijenta',

  'age.one': '{n} godina',
  'age.few': '{n} godine',
  'age.many': '{n} godina',

  'karton.back': 'Svi pacijenti',
  'karton.born': 'Rođenje: {date} ({age})',
  'karton.allergies': 'Alergije',
  'karton.personal': 'Lični podaci',
  'karton.savePersonal': 'Sačuvaj lične podatke',
  'karton.personalSaved': 'Lični podaci su sačuvani.',
  'karton.medical': 'Medicinski podaci',
  'karton.allergiesHint': 'Prikazuje se crveno na vrhu kartona.',
  'karton.medicalHistory': 'Bolesti i terapija',
  'karton.medicalHint': 'Hronične bolesti i lijekovi koje pacijent uzima.',
  'karton.dentalHistory': 'Raniji stomatološki tretmani',
  'karton.notes': 'Napomene',
  'karton.saveMedical': 'Sačuvaj medicinske podatke',
  'karton.medicalSaved': 'Medicinski podaci su sačuvani.',
  'karton.history': 'Historija',
  'karton.addEntry': 'Novi zapis',
  'karton.noEntries': 'U kartonu još nema zapisa.',
  'karton.clinicalOnly': 'Medicinske podatke i historiju vide vlasnik, doktori, specijalisti i asistenti.',
  'karton.archive': 'Arhiviraj pacijenta',
  'karton.confirmArchive': 'Potvrdi arhiviranje',
  'karton.archiveNote': 'Arhiviran pacijent se ne prikazuje na spisku. Karton ostaje sačuvan i može se vratiti.',
  'karton.unarchive': 'Vrati iz arhive',
  'karton.archivedBanner': 'Pacijent je arhiviran.',
  'karton.notFound': 'Pacijent nije pronađen ili nemaš pristup.',

  'karton.teeth': 'Zubi',
  'karton.teethHint': 'Označeni zubi imaju zapise. Klikni zub da vidiš samo njegovu historiju.',
  'karton.showDeciduous': 'Prikaži mliječne zube',
  'karton.hideDeciduous': 'Sakrij mliječne zube',
  'karton.toothFilter': 'Zapisi za zub {n}',
  'karton.showAll': 'Svi zapisi',
  'karton.noToothEntries': 'Za zub {n} još nema zapisa.',
  'karton.toothButton': 'Zub {n}, zapisa: {c}',
  'karton.upper': 'Gornja vilica',
  'karton.lower': 'Donja vilica',
  'karton.medicalUpdated': 'Zadnja izmjena: {date}',
  'entry.authorLabel': 'Autor: {name}',
  'err.entryDate': 'Datum zapisa ne može biti u budućnosti.',
  'entry.date': 'Datum',
  'entry.tooth': 'Zub (FDI)',
  'entry.noTooth': 'Bez zuba',
  'entry.permanent': 'Stalni zubi',
  'entry.deciduous': 'Mliječni zubi',
  'entry.diagnosis': 'Dijagnoza',
  'entry.treatment': 'Urađeno',
  'entry.note': 'Napomena',
  'entry.save': 'Sačuvaj zapis',
  'entry.saveEdit': 'Sačuvaj ispravku',
  'entry.edit': 'Ispravi',
  'entry.toothLabel': 'Zub {n}',
  'entry.author': 'Upisao: {name}',
  'entry.edited': 'ispravljeno',
  'entry.saved': 'Zapis je sačuvan.',

  'overview.patients': 'Pacijenti',
  'overview.patientCount': 'U kartoteci: {n}',
  'overview.openPatients': 'Otvori kartoteku',

  'err.dob': 'Datum rođenja ne može biti u budućnosti.',
  'err.tooth': 'Zub mora biti FDI oznaka, npr. 16 ili 55.',
  'err.entryEmpty': 'Upiši dijagnozu, urađeno ili napomenu.',
  'err.patientClinic': 'Pacijent ne pripada ovoj ordinaciji.',
  'err.patientName': 'Upiši ime i prezime.',

  'common.cancel': 'Odustani',
  'common.loading': 'Učitavam…',
  'common.retry': 'Pokušaj ponovo',

  'lang.bs': 'Bosanski',
  'lang.hr': 'Hrvatski',
  'lang.sr': 'Srpski',
  'lang.en': 'English',

  'err.badLogin': 'Email ili lozinka nisu tačni.',
  'err.emailNotConfirmed': 'Email još nije potvrđen. Otvori link iz poruke koju smo poslali.',
  'err.emailTaken': 'Nalog s ovim emailom već postoji. Prijavi se.',
  'err.weakPassword': 'Lozinka mora imati najmanje 8 znakova.',
  'err.rateLimit': 'Previše pokušaja. Sačekaj minut pa probaj ponovo.',
  'err.trialExists': 'Već imaš ordinaciju u probnom periodu.',
  'err.inviteMissing': 'Pozivnica ne postoji ili je poništena.',
  'err.inviteUsed': 'Pozivnica je već iskorištena.',
  'err.inviteExpired': 'Pozivnica je istekla. Zatraži novu od vlasnika ordinacije.',
  'err.inviteWrongEmail': 'Pozivnica je poslana na drugi email. Prijavi se tim emailom.',
  'err.lastOwner': 'Ordinacija mora imati barem jednog aktivnog vlasnika.',
  'err.adminOnly': 'Status pretplate mijenja administrator platforme.',
  'err.clinicName': 'Naziv ordinacije mora imati najmanje 2 znaka.',
  'err.color': 'Boja mora biti u obliku #RRGGBB.',
  'err.email': 'Upiši ispravan email.',
  'err.notAllowed': 'Nemaš dozvolu za ovu izmjenu.',
  'err.network': 'Nema veze sa serverom. Provjeri internet i probaj ponovo.',
  'err.generic': 'Nešto nije uspjelo. Probaj ponovo.',
};

export type Dict = typeof bs;
export type Key = keyof Dict;

const hr: Dict = {
  ...bs,
  'karton.teethHint': 'Označeni zubi imaju zapise. Klikni zub da vidiš samo njegovu povijest.',
  'karton.medicalUpdated': 'Posljednja izmjena: {date}',
  'karton.dentalHistory': 'Prijašnji stomatološki zahvati',
  'patients.search': 'Pretraživanje',
  'patients.noResults': 'Nijedan pacijent ne odgovara pretraživanju.',
  'patients.more': 'Prikazano je prvih {n}. Suzi pretraživanje da pronađeš ostale.',
  'patient.newLead': 'Broj kartona dodjeljuje se automatski.',
  'patients.lead': 'Kartoteka ordinacije.',
  'patients.searchHint': 'Ime, prezime, telefon ili broj kartona. Kvačice nisu potrebne.',
  'patient.create': 'Spremi pacijenta',
  'karton.personal': 'Osobni podaci',
  'karton.savePersonal': 'Spremi osobne podatke',
  'karton.personalSaved': 'Osobni podaci su spremljeni.',
  'karton.medicalHint': 'Kronične bolesti i lijekovi koje pacijent uzima.',
  'karton.saveMedical': 'Spremi medicinske podatke',
  'karton.medicalSaved': 'Medicinski podaci su spremljeni.',
  'karton.history': 'Povijest',
  'karton.clinicalOnly': 'Medicinske podatke i povijest vide vlasnik, doktori, specijalisti i asistenti.',
  'karton.archiveNote': 'Arhivirani pacijent se ne prikazuje na popisu. Karton ostaje spremljen i može se vratiti.',
  'karton.notFound': 'Pacijent nije pronađen ili nemaš pristup.',
  'entry.treatment': 'Učinjeno',
  'entry.save': 'Spremi zapis',
  'entry.saveEdit': 'Spremi ispravak',
  'entry.edited': 'ispravljeno',
  'entry.saved': 'Zapis je spremljen.',
  'err.entryEmpty': 'Upiši dijagnozu, učinjeno ili napomenu.',
  'auth.register': 'Novi račun',
  'auth.submitRegister': 'Izradi račun',
  'auth.forgotLead': 'Upiši email računa. Poslat ćemo ti poveznicu za postavljanje nove lozinke.',
  'auth.sendReset': 'Pošalji poveznicu',
  'auth.resetSent': 'Ako račun s tim emailom postoji, poveznica je poslana. Provjeri i neželjenu poštu.',
  'auth.checkEmail': 'Poslali smo poveznicu za potvrdu na {email}. Otvori je, pa se prijavi.',
  'auth.inviteNotice': 'Imaš pozivnicu u ordinaciju. Prijavi se ili izradi račun emailom na koji je pozivnica poslana.',
  'auth.saveNewPassword': 'Spremi lozinku',
  'auth.resetNeedsLink': 'Ovu stranicu otvara poveznica iz emaila za novu lozinku.',
  'welcome.lead': 'Račun još nije povezan ni s jednom ordinacijom. Registriraj svoju ili se pridruži postojećoj.',
  'welcome.registerTitle': 'Registriraj ordinaciju',
  'welcome.registerLead': 'Postaješ vlasnik ordinacije. Probno razdoblje traje 14 dana.',
  'welcome.submitRegister': 'Registriraj ordinaciju',
  'welcome.joinLead': 'Zalijepi poveznicu ili kod koji ti je poslao vlasnik ordinacije.',
  'welcome.inviteField': 'Poveznica ili kod pozivnice',
  'welcome.badToken': 'To ne izgleda kao pozivnica. Zalijepi cijelu poveznicu.',
  'clinic.doctorName': 'Ime doktora',
  'invite.accepting': 'Prihvaćam pozivnicu…',
  'role.specialist': 'Specijalist',
  'status.trial': 'Probno razdoblje',
  'status.suspended': 'Ordinacija je suspendirana',
  'status.trialOver': 'Probno razdoblje je isteklo {date}.',
  'team.lead': 'Tko ima pristup ordinaciji i s kojom ulogom.',
  'team.specialtyHint': 'npr. ortodont, oralni kirurg',
  'team.removeNote': 'Uklonjeni član gubi pristup ordinaciji. Račun mu ostaje.',
  'team.inviteLead': 'Osoba se mora prijaviti ovim emailom da bi prihvatila pozivnicu.',
  'team.createInvite': 'Izradi pozivnicu',
  'team.inviteReady': 'Pozivnica je spremna. Pošalji ovu poveznicu osobi:',
  'team.copyLink': 'Kopiraj poveznicu',
  'team.expires': 'Vrijedi još {days}',
  'team.saveMember': 'Spremi',
  'settings.saveProfile': 'Spremi profil',
  'settings.profileSaved': 'Profil je spremljen.',
  'settings.saveClinic': 'Spremi ordinaciju',
  'settings.clinicSaved': 'Podaci ordinacije su spremljeni.',
  'err.badLogin': 'Email ili lozinka nisu točni.',
  'err.emailNotConfirmed': 'Email još nije potvrđen. Otvori poveznicu iz poruke koju smo poslali.',
  'err.emailTaken': 'Račun s ovim emailom već postoji. Prijavi se.',
  'err.rateLimit': 'Previše pokušaja. Pričekaj minutu pa pokušaj ponovo.',
  'err.trialExists': 'Već imaš ordinaciju u probnom razdoblju.',
  'err.network': 'Nema veze s poslužiteljem. Provjeri internet i pokušaj ponovo.',
  'err.generic': 'Nešto nije uspjelo. Pokušaj ponovo.',
};

const sr: Dict = {
  ...bs,
  'karton.teethHint': 'Označeni zubi imaju zapise. Klikni zub da vidiš samo njegovu istoriju.',
  'karton.showDeciduous': 'Prikaži mlečne zube',
  'karton.hideDeciduous': 'Sakrij mlečne zube',
  'karton.medicalUpdated': 'Poslednja izmena: {date}',
  'patient.sex': 'Pol',
  'patient.newLead': 'Broj kartona se dodeljuje automatski.',
  'entry.edit': 'Ispravi',
  'karton.history': 'Istorija',
  'karton.medicalHint': 'Hronične bolesti i lekovi koje pacijent uzima.',
  'karton.clinicalOnly': 'Medicinske podatke i istoriju vide vlasnik, doktori, specijalisti i asistenti.',
  'karton.dentalHistory': 'Raniji stomatološki tretmani',
  'karton.archiveNote': 'Arhiviran pacijent se ne prikazuje na spisku. Karton ostaje sačuvan i može da se vrati.',
  'entry.deciduous': 'Mlečni zubi',
  'patients.searchHint': 'Ime, prezime, telefon ili broj kartona. Kvačice nisu potrebne.',
  'auth.forgotLead': 'Upiši email naloga. Poslaćemo ti link za postavljanje nove lozinke.',
  'auth.resetSent': 'Ako nalog s tim emailom postoji, link je poslat. Proveri i neželjenu poštu.',
  'auth.passwordSaved': 'Lozinka je promenjena.',
  'welcome.lead': 'Nalog još nije povezan ni sa jednom ordinacijom. Registruj svoju ili se pridruži postojećoj.',
  'welcome.joinLead': 'Nalepi link ili kod koji ti je poslao vlasnik ordinacije.',
  'welcome.badToken': 'To ne izgleda kao pozivnica. Nalepi ceo link.',
  'invite.accepting': 'Prihvatam pozivnicu…',
  'nav.settings': 'Podešavanja',
  'overview.editClinic': 'Izmeni podatke',
  'status.suspended': 'Ordinacija je suspendovana',
  'team.inviteLead': 'Osoba mora da se prijavi ovim emailom da bi prihvatila pozivnicu.',
  'team.readOnly': 'Članove može da menja samo vlasnik ordinacije.',
  'team.editMember': 'Izmeni',
  'settings.title': 'Podešavanja',
  'settings.ownerOnly': 'Podatke ordinacije menja vlasnik.',
  'err.badLogin': 'Email ili lozinka nisu tačni.',
  'err.rateLimit': 'Previše pokušaja. Sačekaj minut pa probaj ponovo.',
  'err.adminOnly': 'Status pretplate menja administrator platforme.',
  'err.notAllowed': 'Nemaš dozvolu za ovu izmenu.',
  'err.network': 'Nema veze sa serverom. Proveri internet i probaj ponovo.',
  'err.generic': 'Nešto nije uspelo. Probaj ponovo.',
};

const en: Dict = {
  'app.name': 'Dental Pro',

  'auth.tagline': 'Software for dental practices.',
  'auth.login': 'Sign in',
  'auth.register': 'New account',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.passwordHint': 'At least 8 characters.',
  'auth.fullName': 'Full name',
  'auth.phoneOptional': 'Phone (optional)',
  'auth.submitLogin': 'Sign in',
  'auth.submitRegister': 'Create account',
  'auth.forgot': 'Forgot your password?',
  'auth.forgotTitle': 'New password',
  'auth.forgotLead': 'Enter your account email. We will send you a link to set a new password.',
  'auth.sendReset': 'Send link',
  'auth.resetSent': 'If an account with that email exists, the link has been sent. Check your spam folder too.',
  'auth.backToLogin': 'Back to sign in',
  'auth.checkEmailTitle': 'Confirm your email',
  'auth.checkEmail': 'We sent a confirmation link to {email}. Open it, then sign in.',
  'auth.inviteNotice': 'You have an invitation to a practice. Sign in or create an account with the email the invitation was sent to.',
  'auth.newPassword': 'New password',
  'auth.saveNewPassword': 'Save password',
  'auth.passwordSaved': 'Password changed.',
  'auth.resetNeedsLink': 'This page opens from the link in the new-password email.',

  'fdi.caption': 'Dental chart in FDI notation',

  'welcome.title': 'Welcome, {name}',
  'welcome.titlePlain': 'Welcome',
  'welcome.lead': 'Your account is not linked to a practice yet. Register yours or join an existing one.',
  'welcome.registerTitle': 'Register a practice',
  'welcome.registerLead': 'You become the practice owner. The trial lasts 14 days.',
  'welcome.submitRegister': 'Register practice',
  'welcome.joinTitle': 'I have an invitation',
  'welcome.joinLead': 'Paste the link or code the practice owner sent you.',
  'welcome.inviteField': 'Invitation link or code',
  'welcome.submitJoin': 'Join',
  'welcome.badToken': 'That does not look like an invitation. Paste the whole link.',

  'clinic.name': 'Practice name',
  'clinic.doctorName': 'Doctor name',
  'clinic.city': 'City',
  'clinic.address': 'Address',
  'clinic.phone': 'Practice phone',
  'clinic.email': 'Practice email',

  'invite.accepting': 'Accepting invitation…',
  'invite.failedTitle': 'Invitation not accepted',
  'invite.continue': 'Continue',

  'nav.overview': 'Overview',
  'nav.team': 'Team',
  'nav.settings': 'Settings',
  'nav.logout': 'Sign out',
  'nav.clinic': 'Practice',

  'role.owner': 'Owner',
  'role.doctor': 'Dentist',
  'role.specialist': 'Specialist',
  'role.assistant': 'Assistant',
  'role.reception': 'Reception',
  'role.patient': 'Patient',

  'overview.hello': 'Hello, {name}',
  'overview.helloPlain': 'Hello',
  'overview.yourRole': 'Your role: {role}',
  'overview.team': 'Team',
  'overview.activeMembers': 'Active members: {n}',
  'overview.pendingInvites': 'Pending invitations: {n}',
  'overview.openTeam': 'Open team',
  'overview.clinic': 'Practice',
  'overview.noContact': 'Contact details have not been added yet.',
  'overview.editClinic': 'Edit details',

  'status.trial': 'Trial',
  'status.active': 'Active subscription',
  'status.suspended': 'Practice is suspended',
  'status.trialLeft': 'Ends {date}. Remaining: {days}.',
  'status.trialOver': 'The trial ended on {date}.',
  'status.suspendedLead': 'Contact support to reactivate.',
  'days.one': '1 day',
  'days.many': '{n} days',

  'team.title': 'Team',
  'team.lead': 'Who has access to the practice, and in which role.',
  'team.invite': 'Invite member',
  'team.members': 'Members',
  'team.you': 'you',
  'team.role': 'Role',
  'team.specialty': 'Specialty',
  'team.specialtyHint': 'e.g. orthodontist, oral surgeon',
  'team.inactive': 'Deactivated',
  'team.deactivate': 'Deactivate',
  'team.activate': 'Activate',
  'team.remove': 'Remove',
  'team.confirmRemove': 'Confirm removal',
  'team.removeNote': 'A removed member loses access to the practice. Their account stays.',
  'team.noName': 'No name',
  'team.invites': 'Pending invitations',
  'team.noInvites': 'No pending invitations.',
  'team.inviteTitle': 'New invitation',
  'team.inviteLead': 'The person must sign in with this email to accept the invitation.',
  'team.inviteEmail': 'Their email',
  'team.createInvite': 'Create invitation',
  'team.inviteReady': 'The invitation is ready. Send this link to the person:',
  'team.copyLink': 'Copy link',
  'team.copied': 'Copied',
  'team.revoke': 'Revoke',
  'team.expires': 'Valid for {days}',
  'team.expired': 'Expired',
  'team.readOnly': 'Only the practice owner can change members.',
  'team.editMember': 'Edit',
  'team.saveMember': 'Save',

  'settings.title': 'Settings',
  'settings.profile': 'My profile',
  'settings.language': 'Language',
  'settings.loginEmail': 'Sign-in email',
  'settings.saveProfile': 'Save profile',
  'settings.profileSaved': 'Profile saved.',
  'settings.clinic': 'Practice details',
  'settings.clinicLead': 'Name, contact details and colours of the practice.',
  'settings.primaryColor': 'Primary colour',
  'settings.accentColor': 'Accent colour',
  'settings.saveClinic': 'Save practice',
  'settings.clinicSaved': 'Practice details saved.',
  'settings.ownerOnly': 'Practice details are changed by the owner.',

  'nav.patients': 'Patients',

  'patients.title': 'Patients',
  'patients.lead': 'The practice patient register.',
  'patients.new': 'New patient',
  'patients.search': 'Search',
  'patients.searchHint': 'Name, surname, phone or record number.',
  'patients.showArchived': 'Show archived',
  'patients.empty': 'The register is empty. Add the first patient.',
  'patients.emptyArchived': 'No archived patients.',
  'patients.noResults': 'No patient matches the search.',
  'patients.card': 'Record {n}',
  'patients.archived': 'Archived',
  'patients.more': 'Showing the first {n}. Narrow the search to find the rest.',

  'patient.firstName': 'First name',
  'patient.lastName': 'Last name',
  'patient.dob': 'Date of birth',
  'patient.sex': 'Sex',
  'patient.sexF': 'Female',
  'patient.sexM': 'Male',
  'patient.sexNone': 'Not given',
  'patient.phone': 'Phone',
  'patient.email': 'Email',
  'patient.address': 'Address',
  'patient.city': 'City',
  'patient.newTitle': 'New patient',
  'patient.newLead': 'The record number is assigned automatically.',
  'patient.create': 'Save patient',

  'age.one': '{n} year',
  'age.few': '{n} years',
  'age.many': '{n} years',

  'karton.back': 'All patients',
  'karton.born': 'Born: {date} ({age})',
  'karton.allergies': 'Allergies',
  'karton.personal': 'Personal details',
  'karton.savePersonal': 'Save personal details',
  'karton.personalSaved': 'Personal details saved.',
  'karton.medical': 'Medical details',
  'karton.allergiesHint': 'Shown in red at the top of the record.',
  'karton.medicalHistory': 'Conditions and medication',
  'karton.medicalHint': 'Chronic conditions and medication the patient takes.',
  'karton.dentalHistory': 'Previous dental treatment',
  'karton.notes': 'Notes',
  'karton.saveMedical': 'Save medical details',
  'karton.medicalSaved': 'Medical details saved.',
  'karton.history': 'History',
  'karton.addEntry': 'New entry',
  'karton.noEntries': 'There are no entries in this record yet.',
  'karton.clinicalOnly': 'Medical details and history are visible to the owner, dentists, specialists and assistants.',
  'karton.archive': 'Archive patient',
  'karton.confirmArchive': 'Confirm archiving',
  'karton.archiveNote': 'An archived patient is hidden from the list. The record is kept and can be restored.',
  'karton.unarchive': 'Restore from archive',
  'karton.archivedBanner': 'This patient is archived.',
  'karton.notFound': 'Patient not found, or you do not have access.',

  'karton.teeth': 'Teeth',
  'karton.teethHint': 'Marked teeth have entries. Select a tooth to see only its history.',
  'karton.showDeciduous': 'Show primary teeth',
  'karton.hideDeciduous': 'Hide primary teeth',
  'karton.toothFilter': 'Entries for tooth {n}',
  'karton.showAll': 'All entries',
  'karton.noToothEntries': 'Tooth {n} has no entries yet.',
  'karton.toothButton': 'Tooth {n}, entries: {c}',
  'karton.upper': 'Upper jaw',
  'karton.lower': 'Lower jaw',
  'karton.medicalUpdated': 'Last changed: {date}',
  'entry.authorLabel': 'Author: {name}',
  'err.entryDate': 'The entry date cannot be in the future.',
  'entry.date': 'Date',
  'entry.tooth': 'Tooth (FDI)',
  'entry.noTooth': 'No tooth',
  'entry.permanent': 'Permanent teeth',
  'entry.deciduous': 'Primary teeth',
  'entry.diagnosis': 'Diagnosis',
  'entry.treatment': 'Treatment done',
  'entry.note': 'Note',
  'entry.save': 'Save entry',
  'entry.saveEdit': 'Save correction',
  'entry.edit': 'Correct',
  'entry.toothLabel': 'Tooth {n}',
  'entry.author': 'Entered by: {name}',
  'entry.edited': 'corrected',
  'entry.saved': 'Entry saved.',

  'overview.patients': 'Patients',
  'overview.patientCount': 'In the register: {n}',
  'overview.openPatients': 'Open register',

  'err.dob': 'The date of birth cannot be in the future.',
  'err.tooth': 'The tooth must be an FDI number, e.g. 16 or 55.',
  'err.entryEmpty': 'Enter a diagnosis, treatment or note.',
  'err.patientClinic': 'This patient does not belong to this practice.',
  'err.patientName': 'Enter the first and last name.',

  'common.cancel': 'Cancel',
  'common.loading': 'Loading…',
  'common.retry': 'Try again',

  'lang.bs': 'Bosanski',
  'lang.hr': 'Hrvatski',
  'lang.sr': 'Srpski',
  'lang.en': 'English',

  'err.badLogin': 'The email or password is not correct.',
  'err.emailNotConfirmed': 'Your email is not confirmed yet. Open the link in the message we sent.',
  'err.emailTaken': 'An account with this email already exists. Sign in.',
  'err.weakPassword': 'The password must have at least 8 characters.',
  'err.rateLimit': 'Too many attempts. Wait a minute and try again.',
  'err.trialExists': 'You already have a practice in its trial.',
  'err.inviteMissing': 'The invitation does not exist or was revoked.',
  'err.inviteUsed': 'The invitation has already been used.',
  'err.inviteExpired': 'The invitation has expired. Ask the practice owner for a new one.',
  'err.inviteWrongEmail': 'The invitation was sent to a different email. Sign in with that email.',
  'err.lastOwner': 'A practice must have at least one active owner.',
  'err.adminOnly': 'The subscription status is changed by the platform administrator.',
  'err.clinicName': 'The practice name must have at least 2 characters.',
  'err.color': 'The colour must be in the form #RRGGBB.',
  'err.email': 'Enter a valid email.',
  'err.notAllowed': 'You do not have permission for this change.',
  'err.network': 'Cannot reach the server. Check your connection and try again.',
  'err.generic': 'Something went wrong. Try again.',
};

const DICTS: Record<Locale, Dict> = { bs, hr, sr, en };
const STORE_KEY = 'dp.locale';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORE_KEY) as Locale | null;
    if (saved && LOCALES.includes(saved)) return saved;
  } catch {
    /* privatni prozor: bez pohrane */
  }
  const nav = (navigator.language || 'bs').slice(0, 2).toLowerCase() as Locale;
  return LOCALES.includes(nav) ? nav : 'bs';
}

type Vars = Record<string, string | number>;

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: Key, vars?: Vars) => string;
  days: (n: number) => string;
  age: (n: number) => string;
  date: (iso: string) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORE_KEY, l);
    } catch {
      /* bez pohrane */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18n>(() => {
    const dict = DICTS[locale];
    const t = (key: Key, vars?: Vars) => {
      let s: string = dict[key] ?? bs[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      return s;
    };
    return {
      locale,
      setLocale,
      t,
      days: (n: number) => (n === 1 ? t('days.one') : t('days.many', { n })),
      age: (n: number) => {
        if (locale === 'en') return t(n === 1 ? 'age.one' : 'age.many', { n });
        const a = n % 10, b = n % 100;
        if (a === 1 && b !== 11) return t('age.one', { n });
        if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return t('age.few', { n });
        return t('age.many', { n });
      },
      // Ručno formatiranje: ne zavisi od toga podržava li preglednik bosanski.
      date: (iso: string) => {
        // Sam datum (YYYY-MM-DD) čita se po lokalnom vremenu, da ne pomjeri dan.
        const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T00:00:00' : iso);
        if (locale === 'en') {
          return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getFullYear()}`;
        }
        return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
      },
    };
  }, [locale, setLocale]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n izvan I18nProvider');
  return v;
}

/** Broj cijelih dana od sada do datuma (zaokruženo naviše, najmanje 0). */
export function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/** Pune godine od datuma rođenja do danas. */
export function ageFrom(dob: string): number {
  const d = new Date(dob + 'T00:00:00');
  const now = new Date();
  let y = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) y--;
  return Math.max(0, y);
}

/** Današnji datum u obliku YYYY-MM-DD, po lokalnom vremenu. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

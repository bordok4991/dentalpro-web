import type { Key } from './i18n';

/** Poruke iz baze i servisa za prijavu prevodi u ključ za prikaz korisniku. */
const MAP: [RegExp, Key][] = [
  [/Invalid login credentials/i, 'err.badLogin'],
  [/Email not confirmed/i, 'err.emailNotConfirmed'],
  [/already registered|already been registered/i, 'err.emailTaken'],
  [/Password should be|weak password/i, 'err.weakPassword'],
  [/rate limit|too many requests|security purposes/i, 'err.rateLimit'],
  [/probnom periodu/i, 'err.trialExists'],
  [/Pozivnica ne postoji/i, 'err.inviteMissing'],
  [/iskorištena/i, 'err.inviteUsed'],
  [/istekla/i, 'err.inviteExpired'],
  [/drugu email adresu/i, 'err.inviteWrongEmail'],
  [/aktivnog vlasnika/i, 'err.lastOwner'],
  [/administrator platforme/i, 'err.adminOnly'],
  [/clinics_name_check/i, 'err.clinicName'],
  [/_color_check/i, 'err.color'],
  [/clinic_invites_email_check/i, 'err.email'],
  [/date_of_birth_check/i, 'err.dob'],
  [/tooth_check/i, 'err.tooth'],
  [/entry_date_check/i, 'err.entryDate'],
  [/patient_entries_check/i, 'err.entryEmpty'],
  [/patients_email_check/i, 'err.email'],
  [/ne pripada ovoj ordinaciji/i, 'err.patientClinic'],
  [/first_name_check|last_name_check/i, 'err.patientName'],
  [/appointments_no_overlap/i, 'err.overlap'],
  [/ne radi u ovoj ordinaciji/i, 'err.doctorNotMember'],
  [/appointments_time_check/i, 'err.apptTime'],
  [/services_clinic_name_idx/i, 'err.serviceTaken'],
  [/samo dok je plan nacrt|brisati samo dok/i, 'err.planLocked'],
  [/Prihvaćeni plan se ne može/i, 'err.planAccepted'],
  [/stavka prihvaćenog plana/i, 'err.doneNeedsAccept'],
  [/nema nijednu stavku/i, 'err.planEmpty'],
  [/ne može preći iz statusa/i, 'err.planTransition'],
  [/već odgovoreno/i, 'err.planAnswered'],
  [/Ponuda je istekla/i, 'err.offerExpired'],
  [/Plan ne pripada ovom pacijentu/i, 'err.planPatient'],
  [/samo stornirati/i, 'err.paymentLocked'],
  [/već stornirana/i, 'err.paymentVoided'],
  [/razlog storniranja/i, 'err.voidReason'],
  [/payments_amount_check|amount_check/i, 'err.amount'],
  [/paid_on_check/i, 'err.payDate'],
  [/clinics_hours_check/i, 'err.hours'],
  [/već radi u ordinaciji/i, 'err.staffNotPatient'],
  [/Karton je već povezan/i, 'err.cardLinked'],
  [/drugim kartonom/i, 'err.otherCard'],
  [/samo pozivnicom/i, 'err.linkByInvite'],
  [/nije slobodan/i, 'err.slotTaken'],
  [/Već imate 3/i, 'err.tooManyBookings'],
  [/zakazivanje trenutno nije uključeno/i, 'err.bookingOff'],
  [/nije povezan s kartonom/i, 'err.notLinked'],
  [/ne može zakazati online/i, 'err.serviceNotOnline'],
  [/24 sata prije/i, 'err.cancelLate'],
  [/više ne može otkazati/i, 'err.cantCancel'],
  [/ne može potvrditi/i, 'err.cantConfirm'],
  [/Termin ne postoji/i, 'err.apptMissing'],
  [/Plan ne postoji/i, 'plan.notFound'],
  [/mime type|exceeded the maximum allowed size|Payload too large|Bucket not found/i, 'err.upload'],
  [/NOT_ALLOWED|row-level security|permission denied/i, 'err.notAllowed'],
  [/Failed to fetch|NetworkError|Load failed/i, 'err.network'],
];

export function errorKey(e: unknown): Key {
  const msg = messageOf(e);
  for (const [re, key] of MAP) if (re.test(msg)) return key;
  return 'err.generic';
}

export function messageOf(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; details?: unknown };
    return [o.message, o.details].filter((x) => typeof x === 'string').join(' ');
  }
  return String(e);
}

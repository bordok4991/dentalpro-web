import { addDays, shiftMonth } from './format';

export type CalendarView = 'dan' | 'sedmica' | 'mjeseci';

export function weekStart(day: string) {
  const weekday = new Date(day + 'T12:00:00').getDay();
  return addDays(day, -((weekday + 6) % 7));
}

export function calendarRange(day: string, view: CalendarView) {
  if (view === 'mjeseci') return { from: shiftMonth(day, 0), to: shiftMonth(day, 2) };
  const from = view === 'sedmica' ? weekStart(day) : day;
  return { from, to: addDays(from, view === 'sedmica' ? 7 : 1) };
}

export function validDay(day: string | null): day is string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(day + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

// Vrijeme u rasporedu pripada ordinaciji, bez obzira na vremensku zonu uređaja.
const formatters = new Map<string, Intl.DateTimeFormat>();

export function clinicTime(value: string | Date, zone: string) {
  let fmt = formatters.get(zone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('sv-SE', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    formatters.set(zone, fmt);
  }
  const parts = Object.fromEntries(fmt.formatToParts(new Date(value)).map(({ type, value }) => [type, value]));
  return { day: parts.year + '-' + parts.month + '-' + parts.day, time: parts.hour + ':' + parts.minute };
}

export function clinicInstant(day: string, time: string, zone: string) {
  if (!validDay(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const target = Date.parse(day + 'T' + time + ':00Z');
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const wall = clinicTime(new Date(guess), zone);
    const delta = target - Date.parse(wall.day + 'T' + wall.time + ':00Z');
    if (!delta) return new Date(guess);
    guess += delta;
  }
  return null; // Lokalni sat preskočen pri prelasku na ljetno računanje vremena.
}

export function minutesAt(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function clockAtMinute(minute: number) {
  return String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
}

export function validDuration(n: number) {
  return Number.isInteger(n) && n >= 5 && n <= 480;
}

import { useMemo } from 'react';
import { addDays, shiftMonth } from '../lib/format';
import { clinicTime, minutesAt, weekStart, type CalendarView } from '../lib/schedule';
import { useI18n, type Key } from '../lib/i18n';
import type { Appointment, WorkingHours } from '../lib/types';

const HOUR = 60;
export interface CalendarDoctor { id: string; name: string; active: boolean }

interface Props {
  view: CalendarView;
  from: string;
  today: string;
  zone: string;
  doctors: CalendarDoctor[];
  events: Appointment[];
  workingHours: WorkingHours;
  selected: string | null;
  onOpen: (id: string) => void;
  onDay: (day: string) => void;
  onNew: (day: string, time: string, doctorId: string) => void;
}

interface Segment {
  appt: Appointment;
  from: number;
  to: number;
  start: string;
}

// Oba kraja intervala su lokalna vremena ordinacije. Ponoć je kraj prethodnog dana.
function daysOfEvents(events: Appointment[], zone: string) {
  const days = new Map<string, Segment[]>();
  for (const appt of events) {
    const start = clinicTime(appt.starts_at, zone);
    const end = clinicTime(appt.ends_at, zone);
    for (let d = start.day; d <= end.day; d = addDays(d, 1)) {
      const from = d === start.day ? minutesAt(start.time) : 0;
      const to = d === end.day ? minutesAt(end.time) : 1440;
      if (to === 0) continue;
      const items = days.get(d) ?? [];
      items.push({ appt, from, to: Math.max(from + 1, to), start: start.time });
      days.set(d, items);
    }
  }
  return days;
}

// Termini različitih doktora u isto vrijeme dijele širinu kolone.
function placeEvents(events: Segment[]) {
  const placed: { segment: Segment; lane: number; lanes: number }[] = [];
  let group: typeof placed = [];
  let laneEnds: number[] = [];
  for (const segment of [...events].sort((a, b) => a.from - b.from || b.to - a.to)) {
    if (laneEnds.every((end) => end <= segment.from)) {
      for (const item of group) item.lanes = laneEnds.length;
      group = [];
      laneEnds = [];
    }
    let lane = laneEnds.findIndex((end) => end <= segment.from);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = segment.to;
    const item = { segment, lane, lanes: 1 };
    group.push(item);
    placed.push(item);
  }
  for (const item of group) item.lanes = laneEnds.length;
  return placed;
}

export function CalendarBoard({ view, from, today, zone, doctors, events, workingHours, selected, onDay, onOpen, onNew }: Props) {
  const { t, date } = useI18n();
  const weekdays = t('cal.weekdays').split('|');
  const names = t('cal.months').split('|');
  const byDay = useMemo(() => daysOfEvents(events, zone), [events, zone]);
  const formatDay = (day: string) => date(day);

  if (view === 'mjeseci') return (
    <div className="cal-months">
      {[from, shiftMonth(from, 1)].map((month) => {
        const first = new Date(month + 'T12:00:00');
        const next = shiftMonth(month, 1);
        const gridStart = weekStart(month);
        return <section key={month} className="cal-month">
          <h2>{names[first.getMonth()]} {first.getFullYear()}</h2>
          <div className="cal-month-grid">
            {[1, 2, 3, 4, 5, 6, 0].map((i) => <span className="cal-weekday" key={i}>{weekdays[i].slice(0, 3)}</span>)}
            {Array.from({ length: 42 }, (_, i) => {
              const d = addDays(gridStart, i);
              if (d < month || d >= next) return <span key={d} aria-hidden="true" />;
              const items = byDay.get(d) ?? [];
              const visits = items.filter((a) => !a.appt.is_private_block).length;
              const blocks = items.length - visits;
              const label = [formatDay(d), t('cal.count', { n: visits }), t('cal.blocksCount', { n: blocks })].join(' · ');
              return <button type="button" className="cal-month-day" key={d} onClick={() => onDay(d)}
                aria-current={d === today ? 'date' : undefined} aria-label={label} title={label}>
                <strong>{Number(d.slice(-2))}</strong>
                {items.length > 0 && <span className="cal-month-load">{items.length}</span>}
              </button>;
            })}
          </div>
        </section>;
      })}
    </div>
  );

  const weekly = view === 'sedmica';
  const cols = weekly ? Array.from({ length: 7 }, (_, i) => {
    const day = addDays(from, i);
    const d = new Date(day + 'T12:00:00');
    return { key: day, day, provider: '', title: weekdays[d.getDay()].slice(0, 3) + ' ' + d.getDate() + '.' };
  }) : doctors.map((d) => ({ key: d.id, day: from, provider: d.id, title: d.name }));
  const hoursFor = (day: string) => workingHours[String(new Date(day + 'T12:00:00').getDay()) as keyof WorkingHours];
  let startHour = 7;
  let endHour = 20;
  for (const col of cols) {
    const hours = hoursFor(col.day);
    if (hours) {
      startHour = Math.min(startHour, Math.floor(minutesAt(hours[0]) / 60));
      endHour = Math.max(endHour, Math.ceil(minutesAt(hours[1]) / 60));
    }
    for (const s of byDay.get(col.day) ?? []) {
      startHour = Math.min(startHour, Math.floor(s.from / 60));
      endHour = Math.max(endHour, Math.ceil(s.to / 60));
    }
  }
  const hourNumbers = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const now = clinicTime(new Date(), zone);
  const height = hourNumbers.length * HOUR;
  const offset = (min: number) => (min - startHour * 60) * HOUR / 60;
  return <>
    <div className="cal-scroll" tabIndex={0} aria-label={t('cal.title')}>
      <div className={'cal-grid' + (weekly ? ' cal-week-grid' : '')} style={{ ['--cols' as string]: Math.max(1, cols.length) }}>
        <div className="cal-corner" />
        {cols.map((c) => <div key={c.key} className="cal-colhead" data-today={c.day === today}>
          {weekly ? <button type="button" onClick={() => onDay(c.day)} title={t('cal.viewDay')}>{c.title}</button> : <strong>{c.title}</strong>}
        </div>)}
        <div className="cal-times" style={{ height }} aria-hidden="true">
          {hourNumbers.map((h) => <span key={h} style={{ top: offset(h * 60) }}>{String(h).padStart(2, '0')}:00</span>)}
        </div>
        {cols.map((c) => {
          const segments = (byDay.get(c.day) ?? []).filter((s) => !c.provider || s.appt.doctor_id === c.provider);
          const hours = hoursFor(c.day);
          const fromMin = hours ? minutesAt(hours[0]) : 0;
          const toMin = hours ? minutesAt(hours[1]) : 0;
          const staff = doctors.filter((d) => d.active && (!c.provider || c.provider === d.id));
          return <div className="cal-col" key={c.key} style={{ height, ['--hour' as string]: HOUR + 'px' }}>
            {hours && <div className="cal-office" style={{ top: offset(fromMin), height: (toMin - fromMin) * HOUR / 60 }} />}
            {hours && Array.from({ length: Math.ceil((toMin - fromMin) / 30) }, (_, n) => {
              const m = fromMin + 30 * n;
              const available = staff.filter((d) => !segments.some((s) => s.appt.doctor_id === d.id && !['otkazan', 'nije_dosao'].includes(s.appt.status) && s.from <= m && m < s.to));
              if (!available.length) return null;
              const time = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
              const label = t('cal.freeAt', { day: formatDay(c.day), time });
              return <button type="button" className="cal-slot" key={m} aria-label={label} title={label}
                style={{ top: offset(m), height: Math.min(30, toMin - m) * HOUR / 60 }}
                onClick={() => onNew(c.day, time, available[0].id)}>{time}</button>;
            })}
            {placeEvents(segments).map(({ segment: { appt: a, from: first, to: last, start }, lane, lanes }) => {
              const name = a.is_private_block ? t('cal.blocked') : a.patient ? a.patient.first_name + ' ' + a.patient.last_name : a.service;
              const title = [name, start, a.is_private_block ? '' : a.service, a.doctor?.full_name].filter(Boolean).join(' · ');
              const h = Math.max((last - first) * HOUR / 60 - 1, 8);
              return <button type="button" key={a.id} title={title} aria-label={title} aria-pressed={selected === a.id}
                className={'appt appt-st-' + a.status + (a.is_private_block ? ' appt-block' : '') + (h < 40 ? ' appt-short' : '')}
                style={{ top: offset(first), height: h, left: 'calc(' + (100 * lane / lanes) + '% + 2px)', right: 'calc(' + (100 * (lanes - lane - 1) / lanes) + '% + 2px)' }}
                onClick={() => onOpen(a.id)}>
                <strong>{start} {name}</strong>
                {!a.is_private_block && <span>{a.service}</span>}
                {h >= 55 && <span>{weekly ? a.doctor?.full_name : a.is_private_block ? '' : t(('cal.status.' + a.status) as Key)}</span>}
              </button>;
            })}
            {c.day === now.day && offset(minutesAt(now.time)) >= 0 && offset(minutesAt(now.time)) < height &&
              <div className="cal-now" style={{ top: offset(minutesAt(now.time)) }} aria-hidden="true" />}
          </div>;
        })}
      </div>
    </div>
  </>;
}

import { useEffect, useState } from 'react';
import { useI18n, type Key } from '../lib/i18n';
import { addDays } from '../lib/format';
import { clinicTime, clockAtMinute } from '../lib/schedule';
import { api } from '../lib/session';
import { errorKey } from '../lib/errors';
import { Notice, SelectField } from './ui';
import type { CalendarDoctor, CalendarSegment } from './CalendarBoard';

interface Props {
  day: string;
  weekFrom?: string;
  today: string;
  byDay: ReadonlyMap<string, CalendarSegment[]>;
  doctors: CalendarDoctor[];
  clinicId: string;
  zone: string;
  selected: string | null;
  onSelectDay: (day: string) => void;
  onOpen: (id: string) => void;
  onNew: (day: string, time: string, doctorId: string) => void;
}

export function CalendarAgenda({ day, weekFrom, today, byDay, doctors, clinicId, zone, selected, onSelectDay, onOpen, onNew }: Props) {
  const { t, date } = useI18n();
  const weekdays = t('cal.weekdays').split('|');
  const dayName = (value: string) => weekdays[new Date(value + 'T12:00:00').getDay()];
  const entries = byDay.get(day) ?? [];
  const active = doctors.filter((d) => d.active);

  return <div className="cal-agenda">
    {weekFrom && <div className="cal-day-picker" role="group" aria-label={t('cal.chooseDay')}>
      {Array.from({ length: 7 }, (_, i) => {
        const value = addDays(weekFrom, i);
        const items = byDay.get(value) ?? [];
        const blocks = items.filter((entry) => entry.appt.is_private_block).length;
        const description = [dayName(value), date(value), t('cal.count', { n: items.length - blocks })];
        if (blocks) description.push(t('cal.blocksCount', { n: blocks }));
        return <button type="button" key={value} aria-pressed={day === value} aria-current={value === today ? 'date' : undefined}
          aria-label={description.join(', ')} onClick={() => onSelectDay(value)}>
          <span>{dayName(value).slice(0, 3)}</span><strong>{Number(value.slice(-2))}</strong>
          <i aria-hidden="true" data-busy={items.length > 0} />
        </button>;
      })}
    </div>}
    <h2 className="cal-agenda-date">{dayName(day)}, {date(day)}</h2>
    {!entries.length ? <p className="cal-agenda-empty">{t('cal.empty')}</p> : (
      <ol className="cal-agenda-list">
        {entries.map(({ appt: a, from, to, name }) => <li key={a.id}>
          <button type="button" className={'appt cal-agenda-event appt-st-' + a.status + (a.is_private_block ? ' appt-block' : '')}
            aria-pressed={a.id === selected} onClick={() => onOpen(a.id)}>
            <span className="cal-agenda-time">{clockAtMinute(from)}<small>{clockAtMinute(to)}</small></span>
            <span className="cal-agenda-copy">
              <strong>{name}</strong>
              {!a.is_private_block && a.service !== name && <span>{a.service}</span>}
              {doctors.length > 1 && a.doctor?.full_name && <small>{a.doctor.full_name}</small>}
              {(!a.is_private_block || a.status === 'otkazan') && <small>{t(('cal.status.' + a.status) as Key)}</small>}
            </span>
            <span className="cal-agenda-chevron" aria-hidden="true">›</span>
          </button>
        </li>)}
      </ol>
    )}
    {active.length > 0 && day >= today && <AgendaSlots key={day + '/' + active.map((d) => d.id).join('/')} day={day}
      doctors={active} clinicId={clinicId} zone={zone} onNew={onNew} />}
  </div>;
}

function AgendaSlots({ day, doctors, clinicId, zone, onNew }: Pick<Props, 'day' | 'doctors' | 'clinicId' | 'zone' | 'onNew'>) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [doctor, setDoctor] = useState(doctors[0].id);
  const [times, setTimes] = useState<string[] | null>(null);
  const [error, setError] = useState<Key | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setTimes(null);
    setError(null);
    api.slots(clinicId, doctor, day, 30).then((list) => {
      if (alive) setTimes(list.map((iso) => clinicTime(iso, zone).time));
    }).catch((err) => alive && setError(errorKey(err)));
    return () => { alive = false; };
  }, [open, clinicId, doctor, day, zone]);

  return <details className="cal-agenda-slots" onToggle={(e) => setOpen(e.currentTarget.open)}>
    <summary>{t('cal.slots')} <span>· {t('services.minutes', { n: 30 })}</span></summary>
    {open && <div className="cal-agenda-slot-body">
      {doctors.length > 1 && <SelectField label={t('appt.doctor')} value={doctor} onChange={(e) => setDoctor(e.target.value)}>
        {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </SelectField>}
      {error ? <Notice kind="error">{t(error)}</Notice> : !times ? <p className="hint">{t('common.loading')}</p> :
        !times.length ? <p className="hint">{t('cal.noSlots')}</p> :
        <div className="cal-slot-list">{times.map((time, i) => <button type="button" key={time + i} onClick={() => onNew(day, time, doctor)}>{time}</button>)}</div>}
    </div>}
  </details>;
}

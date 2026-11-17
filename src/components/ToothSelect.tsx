import { useI18n } from '../lib/i18n';
import { FDI_DECIDUOUS, FDI_PERMANENT } from '../lib/types';
import { SelectField } from './ui';

export function ToothSelect({ value, onChange, label }: { value: number | null; onChange: (n: number | null) => void; label?: string }) {
  const { t } = useI18n();
  return (
    <SelectField label={label ?? t('entry.tooth')} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{t('entry.noTooth')}</option>
      <optgroup label={t('entry.permanent')}>
        {FDI_PERMANENT.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </optgroup>
      <optgroup label={t('entry.deciduous')}>
        {FDI_DECIDUOUS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </optgroup>
    </SelectField>
  );
}

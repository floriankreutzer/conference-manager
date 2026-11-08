import { t } from '../../../core/i18n.js';
import { el, field } from '../../../core/ui.js';
import { DURATION_FACTORS, durationMinutes, initialDurationUnit } from './duration.js';

export function createPolicyDurationEditor({ id, label, minutes, minimum = 0, maximum, disabled = false }) {
  let previousUnit = initialDurationUnit(minutes);
  const amount = el('input', { type: 'number', value: String(minutes / DURATION_FACTORS[previousUnit]),
    disabled, attrs: { required: true, step: 'any' } });
  const unit = el('select', { disabled }, Object.keys(DURATION_FACTORS).map((value) =>
    el('option', { value, text: t(`tenantSettings.duration.${value}`) })));
  unit.value = previousUnit;
  const error = el('p', { id: `${id}-error`, className: 'field-error' });
  amount.setAttribute('aria-describedby', `${id}-error`);
  const read = () => durationMinutes(amount.value, unit.value, minimum, maximum);
  function validate() {
    try {
      read();
      amount.setCustomValidity('');
      amount.removeAttribute('aria-invalid');
      error.textContent = '';
      return true;
    } catch {
      error.textContent = t('tenantSettings.duration.invalid');
      amount.setCustomValidity(error.textContent);
      amount.setAttribute('aria-invalid', 'true');
      return false;
    }
  }
  function bounds() {
    amount.min = String(minimum / DURATION_FACTORS[unit.value]);
    amount.max = String(maximum / DURATION_FACTORS[unit.value]);
  }
  amount.addEventListener('input', validate);
  unit.addEventListener('change', () => {
    try {
      const current = durationMinutes(amount.value, previousUnit, minimum, maximum);
      amount.value = String(current / DURATION_FACTORS[unit.value]);
      previousUnit = unit.value;
      bounds();
    } catch { unit.value = previousUnit; }
    validate();
  });
  bounds();
  return Object.freeze({ read, node: el('fieldset', { className: 'policy-duration' }, [
    el('legend', { text: label }),
    field({ id, label: t('tenantSettings.duration.value'), control: amount, required: true }),
    field({ id: `${id}-unit`, label: t('tenantSettings.duration.unit'), control: unit }), error,
  ]) });
}

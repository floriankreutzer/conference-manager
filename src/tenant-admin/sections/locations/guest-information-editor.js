import { normalizeGuestPresentation } from '../../../core/guest-presentation.js';
import { t } from '../../../core/i18n.js';
import { el, field } from '../../../core/ui.js';

const PREFIX = 'tenantSettings.guest.';
const TEXT_FIELDS = Object.freeze({
  publicTransport: 600,
  arrival: 600,
  parking: 600,
  reception: 600,
  building: 600,
  visitorNotes: 1_200,
  accessibility: 600,
});
const ADDRESS_FIELDS = Object.freeze({ line1: 160, line2: 160, postalCode: 32, city: 120, countryCode: 2 });
const WIFI_POLICIES = ['open', 'credentials_on_arrival', 'contact_organizer', 'not_available'];
const optionalValue = (control) => control.value.trim() || null;

export function createGuestInformationEditor(guestInformation, index) {
  const value = normalizeGuestPresentation(guestInformation);
  const enabled = el('input', { type: 'checkbox', checked: value !== null });
  const controls = {};
  const controlFields = [];
  const id = `tenant-site-guest-${index}`;
  const error = el('p', { id: `${id}-error`, className: 'field-error', attrs: { role: 'alert' } });
  let invalidControl = null;

  function input(key, current, maximum, { type = 'text', labelKey = `${PREFIX}${key}` } = {}) {
    const control = el('input', { type, value: current ?? '', attrs: { maxlength: String(maximum) } });
    controls[key] = control;
    const node = field({ id: `${id}-${key}`, label: t(labelKey), control, optional: true });
    control.addEventListener('input', clearError);
    control.addEventListener('change', clearError);
    controlFields.push(node);
    return control;
  }

  for (const [key, maximum] of Object.entries(ADDRESS_FIELDS)) {
    const label = key === 'line1' ? 'addressLine1' : key === 'line2' ? 'addressLine2' : key;
    input(key, value?.address?.[key], maximum, { labelKey: `tenantSettings.locations.${label}` });
  }
  for (const [key, maximum] of Object.entries(TEXT_FIELDS)) input(key, value?.[key], maximum);
  input('contactName', value?.contact?.name, 160);
  input('contactEmail', value?.contact?.email, 254, { type: 'email' });
  input('contactPhone', value?.contact?.phone, 64, { type: 'tel' });
  input('routeUrl', value?.routeUrl, 2_048, { type: 'url' });
  const wifiPolicy = el('select', {}, WIFI_POLICIES.map((policy) => el('option', {
    value: policy, text: t(`${PREFIX}wifiPolicy.${policy}`),
  })));
  wifiPolicy.value = value?.wifiPolicy ?? 'not_available';
  controls.wifiPolicy = wifiPolicy;
  controlFields.push(field({ id: `${id}-wifiPolicy`, label: t(`${PREFIX}wifiPolicy`), control: wifiPolicy }));
  input('wifiNetworkName', value?.wifiNetworkName, 64);
  const fields = el('fieldset', {
    className: 'room-option-fieldset', attrs: { 'aria-labelledby': `${id}-legend` },
  }, [el('div', { className: 'form-grid' }, controlFields)]);
  const description = el('p', {
    id: `${id}-description`, className: 'muted', text: t(`${PREFIX}description`),
  });
  const node = el('fieldset', {
    className: 'card',
    dataset: { guestInformationEditor: String(index) },
    attrs: { 'aria-describedby': description.id },
  }, [
    el('legend', { id: `${id}-legend`, text: t(`${PREFIX}title`) }),
    description,
    field({ id: `${id}-enabled`, label: t(`${PREFIX}enabled`), control: enabled }),
    fields,
    error,
  ]);

  function clearError() {
    if (invalidControl) {
      invalidControl.setCustomValidity('');
      invalidControl.removeAttribute('aria-invalid');
      invalidControl.removeAttribute('aria-describedby');
    }
    invalidControl = null;
    error.textContent = '';
  }

  function synchronize() {
    fields.hidden = !enabled.checked;
    fields.disabled = !enabled.checked;
    controls.wifiNetworkName.disabled = !enabled.checked || wifiPolicy.value === 'not_available';
    clearError();
  }
  enabled.addEventListener('change', synchronize);
  wifiPolicy.addEventListener('change', synchronize);
  synchronize();

  function readValue() {
    clearError();
    if (!enabled.checked) return null;
    const address = Object.fromEntries(Object.keys(ADDRESS_FIELDS).map((key) => [key, optionalValue(controls[key])]));
    if (address.countryCode) address.countryCode = address.countryCode.toUpperCase();
    const contact = {
      name: optionalValue(controls.contactName),
      email: optionalValue(controls.contactEmail),
      phone: optionalValue(controls.contactPhone),
    };
    try {
      return normalizeGuestPresentation({
        address: Object.values(address).some(Boolean) ? address : null,
        ...Object.fromEntries(Object.keys(TEXT_FIELDS).map((key) => [key, optionalValue(controls[key])])),
        contact: Object.values(contact).some(Boolean) ? contact : null,
        routeUrl: optionalValue(controls.routeUrl),
        wifiPolicy: wifiPolicy.value,
        wifiNetworkName: wifiPolicy.value === 'not_available' ? null : optionalValue(controls.wifiNetworkName),
      });
    } catch (cause) {
      invalidControl = controls[cause.field] ?? controls.arrival;
      const message = t(`${PREFIX}invalid`);
      error.textContent = message;
      invalidControl.setCustomValidity(message);
      invalidControl.setAttribute('aria-invalid', 'true');
      invalidControl.setAttribute('aria-describedby', error.id);
      invalidControl.focus();
      throw cause;
    }
  }

  return Object.freeze({ node, readValue });
}

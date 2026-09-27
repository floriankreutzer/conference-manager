import { t } from './i18n.js';
import { el, field } from './ui.js';
import { publicRoomGuestValues, publicSiteGuestValues } from './public-guest-values.js';

const FEATURES = ['step_free_entry', 'lift', 'accessible_toilet', 'hearing_loop'];

function select(values, current) {
  const control = el('select', {}, values.map(([value, label]) => el('option', { value, text: t(label) })));
  control.value = current;
  return control;
}

export function createPublicGuestValueEditor(value, index, kind) {
  const id = `public-guest-${kind}-${index}`;
  const enabled = el('input', { type: 'checkbox', checked: value !== null });
  const controls = {};
  const entries = [];
  if (kind === 'site') {
    for (const name of ['publicTransport', 'parking']) {
      controls[name] = select([
        ['not_available', 'guest.publicAvailability.not_available'],
        ['available', 'guest.publicAvailability.available'],
      ], value?.[name] ?? 'not_available');
      entries.push(field({ id: `${id}-${name}`, label: t(name === 'parking'
        ? 'manager.parking' : 'manager.publicTransport'), control: controls[name] }));
    }
    controls.arrival = select([
      ['not_available', 'guest.publicArrival.not_available'],
      ['reception', 'guest.publicArrival.reception'],
      ['organizer', 'guest.publicArrival.organizer'],
    ], value?.arrival ?? 'not_available');
    entries.push(field({ id: `${id}-arrival`, label: t('guest.arrival'), control: controls.arrival }));
  } else {
    controls.floorNumber = el('input', {
      type: 'number', value: value?.floorNumber ?? '', attrs: { min: '-10', max: '200', step: '1' },
    });
    entries.push(field({ id: `${id}-floor`, label: t('room.floor'), control: controls.floorNumber, optional: true }));
  }
  const features = FEATURES.map((feature) => {
    const control = el('input', {
      type: 'checkbox', checked: Boolean(value?.accessibilityFeatures.includes(feature)),
    });
    entries.push(field({ id: `${id}-${feature}`, label: t(`guest.publicFeature.${feature}`), control }));
    return [feature, control];
  });
  const fields = el('div', { className: 'form-grid' }, entries);
  const node = el('fieldset', { className: 'card' }, [
    el('legend', { text: t('guest.publicValues.title') }),
    field({ id: `${id}-enabled`, label: t('guest.publicValues.enabled'), control: enabled }),
    fields,
  ]);
  function synchronize() {
    fields.hidden = !enabled.checked;
    fields.querySelectorAll('input,select').forEach((control) => { control.disabled = !enabled.checked; });
  }
  enabled.addEventListener('change', synchronize);
  synchronize();
  return Object.freeze({
    node,
    readValue() {
      if (!enabled.checked) return null;
      const accessibilityFeatures = features.filter(([, control]) => control.checked).map(([feature]) => feature);
      return kind === 'site'
        ? publicSiteGuestValues({
          publicTransport: controls.publicTransport.value,
          parking: controls.parking.value,
          arrival: controls.arrival.value,
          accessibilityFeatures,
        })
        : publicRoomGuestValues({
          floorNumber: controls.floorNumber.value === '' ? null : Number(controls.floorNumber.value),
          accessibilityFeatures,
        });
    },
  });
}

import { projectTechnicalLocationConfiguration } from '../../../core/tenant-location-ownership.js';
import { formatDateTime, formatNumber, t } from '../../../core/i18n.js';
import { button, clear, el, field, showToast } from '../../../core/ui.js';
import { TENANT_ADMIN_SECTION_PERMISSION, defineTenantAdminSection } from '../../section-contract.js';
import { renderSectionError, renderSectionLoading } from '../../section-presentation.js';

const TITLE = 'tenantAdmin.locations.title';

function validAdapter(adapter) {
  return adapter !== null && ['loadLocations', 'saveLocations', 'listLocationsHistory']
    .every((method) => typeof adapter?.[method] === 'function');
}

function textInput(value, attrs = {}) {
  return el('input', { type: 'text', value: value ?? '', attrs });
}

function checkbox(checked) {
  return el('input', { type: 'checkbox', checked: Boolean(checked) });
}

function siteOption(site) {
  return el('option', {
    value: site.id,
    text: t('tenantSettings.locations.siteOption', { name: site.name, id: site.id }),
  });
}

function siteEditor(site, index) {
  const controls = {
    name: textInput(site.name, { required: 'required', maxlength: '160' }),
    active: checkbox(site.active),
    timeZone: textInput(site.timeZone, { required: 'required', maxlength: '128' }),
    line1: textInput(site.address?.line1, { maxlength: '160' }),
    line2: textInput(site.address?.line2, { maxlength: '160' }),
    postalCode: textInput(site.address?.postalCode, { maxlength: '32' }),
    city: textInput(site.address?.city, { maxlength: '120' }),
    countryCode: textInput(site.address?.countryCode, { maxlength: '2', pattern: '[A-Za-z]{2}' }),
  };
  const node = el('fieldset', { className: 'card', dataset: { tenantSiteId: site.id } }, [
    el('legend', { text: site.name }),
    el('p', { className: 'muted', text: t('tenantSettings.locations.internalId', { id: site.id }) }),
    el('div', { className: 'form-grid' }, [
      field({ id: `tenant-site-name-${index}`, label: t('tenantSettings.locations.siteName'), control: controls.name, required: true }),
      field({ id: `tenant-site-time-zone-${index}`, label: t('tenantSettings.locations.timeZone'), control: controls.timeZone, required: true }),
      field({ id: `tenant-site-address-${index}`, label: t('tenantSettings.locations.addressLine1'), control: controls.line1, optional: true }),
      field({ id: `tenant-site-address-2-${index}`, label: t('tenantSettings.locations.addressLine2'), control: controls.line2, optional: true }),
      field({ id: `tenant-site-postal-${index}`, label: t('tenantSettings.locations.postalCode'), control: controls.postalCode, optional: true }),
      field({ id: `tenant-site-city-${index}`, label: t('tenantSettings.locations.city'), control: controls.city, optional: true }),
      field({ id: `tenant-site-country-${index}`, label: t('tenantSettings.locations.countryCode'), control: controls.countryCode, optional: true }),
      field({ id: `tenant-site-active-${index}`, label: t('tenantSettings.common.active'), control: controls.active }),
    ]),
  ]);
  return { site, controls, node };
}

function roomTechnicalEditor(room, provider, index, sites) {
  const siteId = el('select', { attrs: { required: 'required' } }, sites.map(siteOption));
  siteId.value = room.siteId;
  const details = [
    el('dt', { text: t('tenantSettings.locations.roomName') }),
    el('dd', { text: room.name }),
    el('dt', { text: t('tenantSettings.locations.capacity') }),
    el('dd', { text: formatNumber(room.capacity) }),
  ];
  if (provider) {
    details.push(
      el('dt', { text: t('tenantSettings.locations.provider') }),
      el('dd', { text: t('tenantSettings.locations.provider.microsoft365') }),
      el('dt', { text: t('tenantSettings.locations.providerRoomName') }),
      el('dd', { text: provider.displayName }),
      el('dt', { text: t('tenantSettings.locations.providerCapacity') }),
      el('dd', { text: provider.capacity === null ? t('tenantSettings.common.notAvailable') : formatNumber(provider.capacity) }),
      el('dt', { text: t('tenantSettings.locations.providerState') }),
      el('dd', { text: t(`tenantSettings.locations.providerState.${provider.status}`) }),
      el('dt', { text: t('tenantSettings.locations.lastSeen') }),
      el('dd', { text: formatDateTime(provider.lastSeenAt) }),
    );
  }
  const node = el('fieldset', { className: 'card', dataset: { tenantRoomId: room.id } }, [
    el('legend', { text: room.name }),
    el('p', { className: 'muted', text: t('tenantSettings.locations.importedRoom') }),
    el('dl', { className: 'details-list' }, details),
    field({
      id: `tenant-room-site-${index}`,
      label: t('tenantSettings.locations.roomSite'),
      control: siteId,
      required: true,
    }),
  ]);
  return { room, controls: { siteId }, node };
}

function siteValue(editor) {
  const { controls, site } = editor;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: controls.timeZone.value }).format();
  } catch {
    throw new TypeError('TENANT_LOCATION_TIME_ZONE_INVALID');
  }
  const requiredAddress = [controls.line1, controls.postalCode, controls.city, controls.countryCode]
    .map((entry) => entry.value.trim());
  const hasAddress = requiredAddress.some(Boolean) || controls.line2.value.trim();
  if (hasAddress && requiredAddress.some((value) => !value)) {
    throw new TypeError('TENANT_LOCATION_ADDRESS_INVALID');
  }
  return {
    ...site,
    name: controls.name.value.trim(),
    active: controls.active.checked,
    timeZone: controls.timeZone.value.trim(),
    address: hasAddress ? {
      line1: requiredAddress[0],
      line2: controls.line2.value.trim() || null,
      postalCode: requiredAddress[1],
      city: requiredAddress[2],
      countryCode: requiredAddress[3].toUpperCase(),
    } : null,
  };
}

function renderHistory(history) {
  const section = el('section', { className: 'card' }, [
    el('h3', { text: t('tenantSettings.history.title') }),
  ]);
  if (!history.length) return section;
  const list = el('ul');
  history.slice(0, 20).forEach((entry) => list.appendChild(el('li', {
    text: t('tenantSettings.history.entry', {
      revision: entry.revision,
      date: formatDateTime(entry.changedAt),
    }),
  })));
  section.appendChild(list);
  return section;
}

export function createLocationsSection({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('LOCATIONS_SECTION_ADAPTER_INVALID');

  async function render({ root, isCurrent, rerender }) {
    renderSectionLoading(root, TITLE);
    let snapshot;
    let history;
    try {
      [snapshot, history] = await Promise.all([
        adapter.loadLocations(),
        adapter.listLocationsHistory({ limit: 20 }),
      ]);
    } catch {
      if (isCurrent()) {
        renderSectionError(root, TITLE);
        const retry = button(t('tenantSettings.action.retry'), { className: 'primary' });
        retry.addEventListener('click', rerender);
        root.querySelector('section')?.appendChild(retry);
      }
      return;
    }
    if (!isCurrent()) return;

    clear(root);
    const providerByRoom = new Map(snapshot.providerContext.map((entry) => [entry.roomId, entry]));
    const siteEditors = snapshot.configuration.sites.map(siteEditor);
    const roomEditors = snapshot.configuration.rooms.map((room, index) => roomTechnicalEditor(
      room,
      providerByRoom.get(room.id),
      index,
      snapshot.configuration.sites,
    ));
    const form = el('form', { dataset: { tenantSettingsForm: 'locations-technical' } });
    form.appendChild(el('h3', { text: t('tenantSettings.locations.sites') }));
    siteEditors.forEach((editor) => form.appendChild(editor.node));
    form.appendChild(el('h3', { text: t('tenantSettings.locations.rooms') }));
    roomEditors.forEach((editor) => form.appendChild(editor.node));

    const save = button(t('tenantSettings.action.save'), {
      className: 'primary',
      attrs: { type: 'submit' },
    });
    const status = el('p', { attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
    form.append(el('div', { className: 'button-row' }, [save]), status);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      save.disabled = true;
      status.textContent = t('tenantSettings.status.saving');
      try {
        const sites = siteEditors.map(siteValue);
        const siteById = new Map(sites.map((site) => [site.id, site]));
        const roomSites = roomEditors.map(({ room, controls }) => ({
          id: room.id,
          siteId: controls.siteId.value,
        }));
        if (roomSites.some(({ siteId }) => !siteById.has(siteId))) {
          throw new TypeError('TENANT_LOCATION_ROOM_SITE_INVALID');
        }
        const configuration = projectTechnicalLocationConfiguration(snapshot.configuration, {
          sites,
          roomSites,
        });
        await adapter.saveLocations({
          expectedRevision: snapshot.revision,
          configuration,
        });
        status.textContent = t('tenantSettings.status.saved');
        showToast(t('tenantSettings.status.saved'));
        rerender();
      } catch {
        save.disabled = false;
        status.textContent = t('tenantSettings.status.saveFailed');
        showToast(t('tenantSettings.status.saveFailed'));
      }
    });

    root.append(form, renderHistory(history));
  }

  return defineTenantAdminSection({
    id: 'locations',
    titleKey: TITLE,
    descriptionKey: 'tenantAdmin.locations.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.CONFIGURE,
    available: validAdapter(adapter),
    render,
  });
}

import { formatDateTime, formatNumber, t } from '../../../core/i18n.js';
import { announce, button, clear, el, field, showToast, validationSummary } from '../../../core/ui.js';
import { TENANT_ADMIN_SECTION_PERMISSION, defineTenantAdminSection } from '../../section-contract.js';
import { renderSectionConflict, renderSectionError, renderSectionLoading } from '../../section-presentation.js';
import { tenantSettingsConflictRevision } from '../../settings-revision.js';

export { createDemoLocationSettings } from './demo-adapter.js';

const TITLE = 'tenantAdmin.locations.title';
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function validAdapter(adapter) {
  return adapter !== null && ['loadLocations', 'saveLocations', 'listLocationsHistory', 'loadLocationRevision', 'rollbackLocations']
    .every((method) => typeof adapter?.[method] === 'function');
}

const textInput = (value, attrs = {}) => el('input', { type: 'text', value: value ?? '', attrs });
const checkbox = (checked) => el('input', { type: 'checkbox', checked });
const commaList = (value, { safe = false } = {}) => {
  const values = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (new Set(values).size !== values.length || (safe && values.some((entry) => !SAFE_ID.test(entry)))) {
    throw new TypeError('TENANT_LOCATION_LIST_INVALID');
  }
  return values;
};
const nextId = (prefix, existing) => {
  let index = existing.size + 1;
  while (existing.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
};

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
  const node = el('fieldset', { className: 'card', dataset: { tenantSiteId: site.id } });
  node.append(el('legend', { text: site.name }), el('p', { className: 'muted', text: t('tenantSettings.locations.internalId', { id: site.id }) }));
  node.append(el('div', { className: 'form-grid' }, [
    field({ id: `tenant-site-name-${index}`, label: t('tenantSettings.locations.siteName'), control: controls.name, required: true }),
    field({ id: `tenant-site-time-zone-${index}`, label: t('tenantSettings.locations.timeZone'), control: controls.timeZone, required: true }),
    field({ id: `tenant-site-address-${index}`, label: t('tenantSettings.locations.addressLine1'), control: controls.line1, optional: true }),
    field({ id: `tenant-site-address-2-${index}`, label: t('tenantSettings.locations.addressLine2'), control: controls.line2, optional: true }),
    field({ id: `tenant-site-postal-${index}`, label: t('tenantSettings.locations.postalCode'), control: controls.postalCode, optional: true }),
    field({ id: `tenant-site-city-${index}`, label: t('tenantSettings.locations.city'), control: controls.city, optional: true }),
    field({ id: `tenant-site-country-${index}`, label: t('tenantSettings.locations.countryCode'), control: controls.countryCode, optional: true }),
    field({ id: `tenant-site-active-${index}`, label: t('tenantSettings.common.active'), control: controls.active }),
  ]));
  return { node, controls, site };
}

function roomEditor(room, provider, index) {
  const controls = {
    name: textInput(room.name, { required: 'required', maxlength: '160' }),
    capacity: el('input', { type: 'number', value: room.capacity, attrs: { min: '1', max: '100000', step: '1', required: 'required' } }),
    active: checkbox(room.active),
    floor: textInput(room.floor, { maxlength: '80' }),
    equipment: textInput(room.equipment.join(', '), { maxlength: '4050' }),
    accessibility: textInput(room.accessibility.join(', '), { maxlength: '1618' }),
    serviceIds: textInput(room.serviceIds.join(', '), { maxlength: '2000' }),
    cateringPackageIds: textInput(room.cateringPackageIds.join(', '), { maxlength: '2000' }),
  };
  const node = el('fieldset', { className: 'card', dataset: { tenantRoomId: room.id } });
  node.append(el('legend', { text: room.name }), el('p', { className: 'muted', text: t('tenantSettings.locations.importedRoom') }));
  if (provider) {
    node.append(el('dl', {}, [
      el('dt', { text: t('tenantSettings.locations.provider') }), el('dd', { text: t('tenantSettings.locations.provider.microsoft365') }),
      el('dt', { text: t('tenantSettings.locations.providerRoomName') }), el('dd', { text: provider.displayName }),
      el('dt', { text: t('tenantSettings.locations.providerCapacity') }), el('dd', {
        text: provider.capacity === null ? t('tenantSettings.common.notAvailable') : formatNumber(provider.capacity),
      }),
      el('dt', { text: t('tenantSettings.locations.providerState') }), el('dd', { text: t(`tenantSettings.locations.providerState.${provider.status}`) }),
      el('dt', { text: t('tenantSettings.locations.lastSeen') }), el('dd', { text: formatDateTime(provider.lastSeenAt) }),
    ]));
  }
  node.append(el('div', { className: 'form-grid' }, [
    field({ id: `tenant-room-name-${index}`, label: t('tenantSettings.locations.roomName'), control: controls.name, required: true }),
    field({ id: `tenant-room-capacity-${index}`, label: t('tenantSettings.locations.capacity'), control: controls.capacity, required: true }),
    field({ id: `tenant-room-floor-${index}`, label: t('tenantSettings.locations.floor'), control: controls.floor, optional: true }),
    field({ id: `tenant-room-equipment-${index}`, label: t('tenantSettings.locations.equipment'), control: controls.equipment, optional: true, hint: t('tenantSettings.common.commaSeparated') }),
    field({ id: `tenant-room-accessibility-${index}`, label: t('tenantSettings.locations.accessibility'), control: controls.accessibility, optional: true, hint: t('tenantSettings.common.commaSeparated') }),
    field({ id: `tenant-room-services-${index}`, label: t('tenantSettings.locations.serviceIds'), control: controls.serviceIds, optional: true, hint: t('tenantSettings.common.commaSeparated') }),
    field({ id: `tenant-room-packages-${index}`, label: t('tenantSettings.locations.cateringPackageIds'), control: controls.cateringPackageIds, optional: true, hint: t('tenantSettings.common.commaSeparated') }),
    field({ id: `tenant-room-active-${index}`, label: t('tenantSettings.common.active'), control: controls.active }),
  ]));
  return { node, controls, room };
}

function configurationFromEditors(siteEditors, roomEditors) {
  const sites = siteEditors.map(({ site, controls }) => {
    try { new Intl.DateTimeFormat('en-GB', { timeZone: controls.timeZone.value }).format(); }
    catch { throw new TypeError('TENANT_LOCATION_TIME_ZONE_INVALID'); }
    const addressValues = [controls.line1, controls.postalCode, controls.city, controls.countryCode].map((entry) => entry.value.trim());
    const hasAddress = addressValues.some(Boolean) || controls.line2.value.trim();
    if (hasAddress && addressValues.some((value) => !value)) throw new TypeError('TENANT_LOCATION_ADDRESS_INVALID');
    return {
      ...site,
      name: controls.name.value.trim(), active: controls.active.checked, timeZone: controls.timeZone.value,
      address: hasAddress ? {
        line1: addressValues[0], line2: controls.line2.value.trim() || null, postalCode: addressValues[1],
        city: addressValues[2], countryCode: addressValues[3].toUpperCase(),
      } : null,
    };
  });
  const rooms = roomEditors.map(({ room, controls }) => ({
    ...room, name: controls.name.value.trim(), capacity: Number(controls.capacity.value), active: controls.active.checked,
    floor: controls.floor.value.trim() || null, equipment: commaList(controls.equipment.value),
    accessibility: commaList(controls.accessibility.value), serviceIds: commaList(controls.serviceIds.value, { safe: true }),
    cateringPackageIds: commaList(controls.cateringPackageIds.value, { safe: true }),
  }));
  const siteById = new Map(sites.map((site) => [site.id, site]));
  if (rooms.some((room) => room.active && !siteById.get(room.siteId)?.active)) {
    throw new TypeError('TENANT_INACTIVE_SITE_HAS_ACTIVE_ROOM');
  }
  return { sites, rooms };
}

export function createLocationsSection({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('LOCATIONS_SECTION_ADAPTER_INVALID');
  let pendingDraft = null;
  let focusAfterSave = false;

  async function render({ root, isCurrent, rerender }) {
    renderSectionLoading(root, TITLE);
    let snapshot;
    let history;
    try { [snapshot, history] = await Promise.all([adapter.loadLocations(), adapter.listLocationsHistory({ limit: 20 })]); }
    catch {
      if (isCurrent()) {
        renderSectionError(root, TITLE);
        const retry = button(t('tenantSettings.action.retry'), { className: 'primary' });
        retry.addEventListener('click', rerender);
        root.querySelector('section')?.appendChild(retry);
      }
      return;
    }
    if (!isCurrent()) return;
    const form = el('form', { dataset: { tenantSettingsForm: 'locations' } });
    const providerByRoom = new Map(snapshot.providerContext.map((entry) => [entry.roomId, entry]));
    const siteEditors = snapshot.configuration.sites.map(siteEditor);
    const roomEditors = snapshot.configuration.rooms.map((room, index) => roomEditor(room, providerByRoom.get(room.id), index));
    const sitesSurface = el('div', {}, siteEditors.map((entry) => entry.node));
    const roomsSurface = el('div', {}, roomEditors.map((entry) => entry.node));
    const addSite = button(t('tenantSettings.locations.addSite'));
    addSite.addEventListener('click', () => {
      const id = nextId('site', new Set(siteEditors.map((entry) => entry.site.id)));
      const editor = siteEditor({ id, name: t('tenantSettings.locations.newSite'), active: true, timeZone: 'Europe/Berlin', address: null }, siteEditors.length);
      siteEditors.push(editor);
      sitesSurface.appendChild(editor.node);
      editor.controls.name.focus();
    });
    form.append(
      el('h3', { text: t('tenantSettings.locations.sites') }), sitesSurface, el('div', { className: 'button-row' }, [addSite]),
      el('h3', { text: t('tenantSettings.locations.rooms') }), roomsSurface,
    );
    const status = el('p', { attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
    const save = button(t('tenantSettings.action.save'), { className: 'primary', attrs: { type: 'submit' } });
    let mutationPending = false;
    form.append(el('div', { className: 'button-row' }, [save]), status);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (mutationPending) return;
      if (!form.reportValidity()) return;
      try { pendingDraft = configurationFromEditors(siteEditors, roomEditors); }
      catch {
        validationSummary(form, t('tenantSettings.validation.checkFields'));
        form.querySelector('input:invalid, input')?.focus();
        return;
      }
      save.disabled = true;
      mutationPending = true;
      status.textContent = t('tenantSettings.status.saving');
      try {
        await adapter.saveLocations({ expectedRevision: snapshot.revision, configuration: pendingDraft });
        focusAfterSave = true;
        showToast(t('tenantSettings.status.saved'));
        announce(t('tenantSettings.status.saved'));
        rerender();
      } catch (error) {
        const currentRevision = tenantSettingsConflictRevision(error);
        if (currentRevision !== null) {
          renderSectionConflict(root, TITLE, {
            currentRevision, onReload: rerender,
            onReapply: async () => {
              try {
                const current = await adapter.loadLocations();
                await adapter.saveLocations({ expectedRevision: current.revision, configuration: pendingDraft });
                focusAfterSave = true;
                rerender();
              } catch { announce(t('tenantSettings.status.saveFailed'), { assertive: true }); }
            },
          });
          root.querySelector('h2')?.focus();
          return;
        }
        save.disabled = false;
        mutationPending = false;
        status.textContent = t('tenantSettings.status.saveFailed');
        announce(status.textContent, { assertive: true });
        save.focus();
      }
    });
    const historyList = el('ol');
    history.forEach((entry) => {
      const rollback = button(t('tenantSettings.history.restore'), { dataset: { sourceRevision: entry.revision } });
      rollback.disabled = entry.revision === snapshot.revision;
      rollback.addEventListener('click', async () => {
        if (mutationPending) return;
        mutationPending = true;
        rollback.disabled = true;
        try {
          await adapter.rollbackLocations({ expectedRevision: snapshot.revision, sourceRevision: entry.revision });
          announce(t('tenantSettings.history.restored'));
          focusAfterSave = true;
          rerender();
        } catch (error) {
          const currentRevision = tenantSettingsConflictRevision(error);
          if (currentRevision !== null) {
            renderSectionConflict(root, TITLE, { currentRevision, onReload: rerender });
            root.querySelector('h2')?.focus();
          } else {
            mutationPending = false;
            rollback.disabled = false;
            announce(t('tenantSettings.status.saveFailed'), { assertive: true });
          }
        }
      });
      historyList.appendChild(el('li', {}, [
        el('span', { text: t('tenantSettings.history.entry', { revision: entry.revision, date: formatDateTime(entry.changedAt) }) }), rollback,
      ]));
    });
    clear(root);
    root.append(
      el('section', { className: 'card' }, [
        el('h2', { text: t(TITLE), attrs: { tabindex: '-1' } }), el('p', { text: t('tenantAdmin.locations.description') }),
        el('p', { className: 'muted', text: t('tenantAdmin.section.revision', { revision: snapshot.revision }) }), form,
      ]),
      el('section', { className: 'card' }, [el('h3', { text: t('tenantSettings.history.title') }), historyList]),
    );
    if (focusAfterSave) { focusAfterSave = false; requestAnimationFrame(() => root.querySelector('h2')?.focus()); }
  }

  return defineTenantAdminSection({
    id: 'locations', titleKey: TITLE, descriptionKey: 'tenantAdmin.locations.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.CONFIGURE, available: validAdapter(adapter), render,
  });
}

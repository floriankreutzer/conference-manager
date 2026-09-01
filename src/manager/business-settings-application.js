import { projectRoomBusinessConfiguration } from '../core/tenant-location-ownership.js';
import { formatDateTime, t } from '../core/i18n.js';
import { button, clear, el, field, showToast } from '../core/ui.js';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ASSET_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CURRENCIES = Object.freeze(['CHF', 'EUR', 'GBP', 'USD']);

function validLocationsAdapter(value) {
  return value && ['loadLocations', 'saveLocations', 'listLocationsHistory']
    .every((method) => typeof value[method] === 'function');
}

function validCatalogueAdapter(value) {
  return value && ['loadCatalogue', 'saveCatalogue', 'listCatalogueHistory']
    .every((method) => typeof value[method] === 'function');
}

function textInput(value, attrs = {}) {
  return el('input', { type: 'text', value: value ?? '', attrs });
}

function numberInput(value, { min = 0, max = 1_000_000_000 } = {}) {
  return el('input', {
    type: 'number',
    value,
    attrs: { min: String(min), max: String(max), step: '1', required: 'required' },
  });
}

function checkbox(value) {
  return el('input', { type: 'checkbox', checked: Boolean(value) });
}

function commaList(value, { maximum = 300, pattern = SAFE_ID } = {}) {
  const items = String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean);
  if (items.length > maximum || new Set(items).size !== items.length || items.some((entry) => !pattern.test(entry))) {
    throw new TypeError('MANAGER_SETTINGS_LIST_INVALID');
  }
  return items;
}

function priceControls(price) {
  const amountMinor = numberInput(price.amountMinor);
  const currency = el('select', {}, CURRENCIES.map((value) => el('option', { value, text: value })));
  currency.value = price.currency;
  return { amountMinor, currency };
}

function priceFromControls(controls) {
  return {
    amountMinor: Number(controls.amountMinor.value),
    currency: controls.currency.value,
  };
}

function commonEntryEditor(entry, prefix) {
  const controls = {
    name: textInput(entry.name, { required: 'required', maxlength: '160' }),
    description: el('textarea', { attrs: { maxlength: '1000' } }),
    price: priceControls(entry.price),
    active: checkbox(entry.active),
    order: numberInput(entry.order, { max: 100_000 }),
    siteIds: textInput(entry.siteIds.join(', '), { maxlength: '3000' }),
    roomIds: textInput(entry.roomIds.join(', '), { maxlength: '3000' }),
  };
  controls.description.value = entry.description || '';
  const node = el('fieldset', { className: 'card', dataset: { catalogueEntryId: entry.id } }, [
    el('legend', { text: entry.name }),
    el('p', { className: 'muted', text: entry.id }),
    el('div', { className: 'form-grid' }, [
      field({ id: `${prefix}-${entry.id}-name`, label: t('managerSettings.catalogue.name'), control: controls.name, required: true }),
      field({ id: `${prefix}-${entry.id}-description`, label: t('managerSettings.catalogue.descriptionField'), control: controls.description, optional: true }),
      field({ id: `${prefix}-${entry.id}-amount`, label: t('managerSettings.catalogue.amountMinor'), control: controls.price.amountMinor, required: true }),
      field({ id: `${prefix}-${entry.id}-currency`, label: t('managerSettings.catalogue.currency'), control: controls.price.currency, required: true }),
      field({ id: `${prefix}-${entry.id}-order`, label: t('managerSettings.catalogue.order'), control: controls.order, required: true }),
      field({ id: `${prefix}-${entry.id}-sites`, label: t('managerSettings.catalogue.siteIds'), control: controls.siteIds, optional: true, hint: t('managerSettings.commaSeparated') }),
      field({ id: `${prefix}-${entry.id}-rooms`, label: t('managerSettings.catalogue.roomIds'), control: controls.roomIds, optional: true, hint: t('managerSettings.commaSeparated') }),
      field({ id: `${prefix}-${entry.id}-active`, label: t('managerSettings.catalogue.active'), control: controls.active }),
    ]),
  ]);
  return { entry, controls, node };
}

function commonEntryValue(editor) {
  return {
    ...editor.entry,
    name: editor.controls.name.value.trim(),
    description: editor.controls.description.value.trim() || null,
    price: priceFromControls(editor.controls.price),
    active: editor.controls.active.checked,
    order: Number(editor.controls.order.value),
    siteIds: commaList(editor.controls.siteIds.value, { maximum: 200 }),
    roomIds: commaList(editor.controls.roomIds.value, { maximum: 200 }),
  };
}

function packageEditor(entry) {
  const editor = commonEntryEditor(entry, 'manager-catalogue-package');
  const itemIds = textInput(entry.itemIds.join(', '), { maxlength: '4000' });
  editor.node.append(
    field({
      id: `manager-catalogue-package-${entry.id}-items`,
      label: t('managerSettings.catalogue.itemIds'),
      control: itemIds,
      optional: true,
      hint: t('managerSettings.commaSeparated'),
    }),
    el('p', { className: 'muted', text: `${t('managerSettings.catalogue.variants')}: ${entry.variants.length}. ${t('managerSettings.catalogue.variantHint')}` }),
  );
  return { ...editor, itemIds };
}

function packageValue(editor) {
  return {
    ...commonEntryValue(editor),
    itemIds: commaList(editor.itemIds.value, { maximum: 300 }),
    variants: editor.entry.variants.map((variant) => ({ ...variant })),
  };
}

function renderHistory(entries) {
  const section = el('section', { className: 'card' }, [el('h3', { text: t('managerSettings.history') })]);
  if (!entries.length) return section;
  const list = el('ul');
  entries.slice(0, 10).forEach((entry) => list.appendChild(el('li', {
    text: t('managerSettings.historyEntry', {
      revision: entry.revision,
      changedAt: entry.changedAt ? formatDateTime(entry.changedAt) : '',
    }),
  })));
  section.appendChild(list);
  return section;
}

export function createManagerBusinessSettingsApplication({
  appRoot,
  setPageHeading,
  locations,
  catalogue,
} = {}) {
  if (!appRoot || typeof setPageHeading !== 'function') {
    throw new TypeError('MANAGER_BUSINESS_SETTINGS_ROOT_REQUIRED');
  }
  if (!validLocationsAdapter(locations) || !validCatalogueAdapter(catalogue)) {
    throw new TypeError('MANAGER_BUSINESS_SETTINGS_ADAPTER_REQUIRED');
  }
  let section = 'rooms';
  let renderRevision = 0;

  function sectionNavigation() {
    const row = el('div', { className: 'button-row', attrs: { role: 'navigation', 'aria-label': t('managerSettings.title') } });
    const rooms = button(t('managerSettings.section.rooms'), {
      className: section === 'rooms' ? 'primary' : '',
      attrs: section === 'rooms' ? { 'aria-current': 'page' } : {},
    });
    const catalog = button(t('managerSettings.section.catalogue'), {
      className: section === 'catalogue' ? 'primary' : '',
      attrs: section === 'catalogue' ? { 'aria-current': 'page' } : {},
    });
    rooms.addEventListener('click', () => { section = 'rooms'; void renderManagerSettings(); });
    catalog.addEventListener('click', () => { section = 'catalogue'; void renderManagerSettings(); });
    row.append(rooms, catalog);
    return row;
  }

  function renderLoading(titleKey, descriptionKey) {
    clear(appRoot);
    setPageHeading(t(titleKey), t(descriptionKey));
    appRoot.append(sectionNavigation(), el('section', {
      className: 'card',
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-busy': 'true' },
    }, [el('p', { text: t('managerSettings.loading') })]));
  }

  function renderFailure(retry) {
    clear(appRoot);
    appRoot.append(sectionNavigation(), el('section', { className: 'card' }, [
      el('p', { className: 'error-box', text: t('managerSettings.error') }),
      (() => {
        const action = button(t('managerSettings.retry'), { className: 'primary' });
        action.addEventListener('click', retry);
        return el('div', { className: 'button-row' }, [action]);
      })(),
    ]));
  }

  async function renderRooms(revision) {
    renderLoading('managerSettings.rooms.title', 'managerSettings.rooms.description');
    let snapshot;
    let history;
    try {
      [snapshot, history] = await Promise.all([
        locations.loadLocations(),
        locations.listLocationsHistory({ limit: 20 }),
      ]);
    } catch {
      if (revision === renderRevision) renderFailure(() => void renderManagerSettings());
      return;
    }
    if (revision !== renderRevision || section !== 'rooms') return;
    clear(appRoot);
    setPageHeading(t('managerSettings.rooms.title'), t('managerSettings.rooms.description'));
    appRoot.appendChild(sectionNavigation());
    const siteById = new Map(snapshot.configuration.sites.map((site) => [site.id, site]));
    const editors = snapshot.configuration.rooms.map((room, index) => {
      const controls = {
        name: textInput(room.name, { required: 'required', maxlength: '160' }),
        capacity: numberInput(room.capacity, { min: 1, max: 100_000 }),
        active: checkbox(room.active),
        floor: textInput(room.floor, { maxlength: '80' }),
        equipment: textInput(room.equipment.join(', '), { maxlength: '4050' }),
        accessibility: textInput(room.accessibility.join(', '), { maxlength: '2000' }),
        serviceIds: textInput(room.serviceIds.join(', '), { maxlength: '4000' }),
        cateringPackageIds: textInput(room.cateringPackageIds.join(', '), { maxlength: '4000' }),
        floorplanAssetId: textInput(room.floorplanAssetId, { maxlength: '128' }),
        mediaAssetIds: textInput(room.mediaAssetIds.join(', '), { maxlength: '4000' }),
      };
      const site = siteById.get(room.siteId);
      const node = el('fieldset', { className: 'card', dataset: { managerRoomId: room.id } }, [
        el('legend', { text: room.name }),
        el('p', { className: 'muted', text: t('managerSettings.room.internalId', { id: room.id }) }),
        el('dl', { className: 'details-list' }, [
          el('dt', { text: t('managerSettings.room.site') }),
          el('dd', { text: site?.name || room.siteId }),
          el('dt', { text: t('managerSettings.room.providerManaged') }),
          el('dd', { text: room.siteId }),
        ]),
        el('div', { className: 'form-grid' }, [
          field({ id: `manager-room-name-${index}`, label: t('managerSettings.room.name'), control: controls.name, required: true }),
          field({ id: `manager-room-capacity-${index}`, label: t('managerSettings.room.capacity'), control: controls.capacity, required: true }),
          field({ id: `manager-room-floor-${index}`, label: t('managerSettings.room.floor'), control: controls.floor, optional: true }),
          field({ id: `manager-room-equipment-${index}`, label: t('managerSettings.room.equipment'), control: controls.equipment, optional: true, hint: t('managerSettings.commaSeparated') }),
          field({ id: `manager-room-accessibility-${index}`, label: t('managerSettings.room.accessibility'), control: controls.accessibility, optional: true, hint: t('managerSettings.commaSeparated') }),
          field({ id: `manager-room-services-${index}`, label: t('managerSettings.room.serviceIds'), control: controls.serviceIds, optional: true, hint: t('managerSettings.commaSeparated') }),
          field({ id: `manager-room-catering-${index}`, label: t('managerSettings.room.cateringPackageIds'), control: controls.cateringPackageIds, optional: true, hint: t('managerSettings.commaSeparated') }),
          field({ id: `manager-room-floorplan-${index}`, label: t('managerSettings.room.floorplanAssetId'), control: controls.floorplanAssetId, optional: true }),
          field({ id: `manager-room-media-${index}`, label: t('managerSettings.room.mediaAssetIds'), control: controls.mediaAssetIds, optional: true, hint: t('managerSettings.commaSeparated') }),
          field({ id: `manager-room-active-${index}`, label: t('managerSettings.room.active'), control: controls.active }),
        ]),
      ]);
      return { room, controls, node };
    });
    const form = el('form');
    editors.forEach((editor) => form.appendChild(editor.node));
    const save = button(t('managerSettings.save'), { className: 'primary', attrs: { type: 'submit' } });
    form.appendChild(el('div', { className: 'button-row' }, [save]));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      save.disabled = true;
      try {
        const roomEdits = editors.map(({ room, controls }) => {
          const floorplanAssetId = controls.floorplanAssetId.value.trim();
          if (floorplanAssetId && !ASSET_ID.test(floorplanAssetId)) throw new TypeError('MANAGER_ROOM_ASSET_INVALID');
          return {
            id: room.id,
            name: controls.name.value.trim(),
            capacity: Number(controls.capacity.value),
            active: controls.active.checked,
            floor: controls.floor.value.trim() || null,
            equipment: commaList(controls.equipment.value, { maximum: 100, pattern: /^.{1,160}$/u }),
            accessibility: commaList(controls.accessibility.value, { maximum: 20, pattern: /^.{1,80}$/u }),
            serviceIds: commaList(controls.serviceIds.value, { maximum: 200 }),
            cateringPackageIds: commaList(controls.cateringPackageIds.value, { maximum: 200 }),
            floorplanAssetId: floorplanAssetId || null,
            mediaAssetIds: commaList(controls.mediaAssetIds.value, { maximum: 20, pattern: ASSET_ID }),
          };
        });
        const configuration = projectRoomBusinessConfiguration(snapshot.configuration, roomEdits);
        await locations.saveLocations({ expectedRevision: snapshot.revision, configuration });
        showToast(t('managerSettings.saved'));
        await renderManagerSettings();
      } catch (error) {
        save.disabled = false;
        showToast(error?.currentRevision ? t('managerSettings.conflict') : t('managerSettings.error'));
      }
    });
    appRoot.append(form, renderHistory(history));
  }

  async function renderCatalogue(revision) {
    renderLoading('managerSettings.catalogue.title', 'managerSettings.catalogue.description');
    let snapshot;
    let locationSnapshot;
    let historyPage;
    try {
      [snapshot, locationSnapshot, historyPage] = await Promise.all([
        catalogue.loadCatalogue(),
        locations.loadLocations(),
        catalogue.listCatalogueHistory({ limit: 20 }),
      ]);
    } catch {
      if (revision === renderRevision) renderFailure(() => void renderManagerSettings());
      return;
    }
    if (revision !== renderRevision || section !== 'catalogue') return;
    clear(appRoot);
    setPageHeading(t('managerSettings.catalogue.title'), t('managerSettings.catalogue.description'));
    appRoot.appendChild(sectionNavigation());
    const form = el('form');
    const sections = [
      ['services', 'managerSettings.catalogue.services'],
      ['equipment', 'managerSettings.catalogue.equipment'],
      ['cateringItems', 'managerSettings.catalogue.cateringItems'],
    ];
    const editorsByCollection = {};
    sections.forEach(([collection, titleKey]) => {
      form.appendChild(el('h3', { text: t(titleKey) }));
      const editors = snapshot.catalogue[collection].map((entry) => commonEntryEditor(entry, `manager-catalogue-${collection}`));
      editorsByCollection[collection] = editors;
      editors.forEach((editor) => form.appendChild(editor.node));
    });
    form.appendChild(el('h3', { text: t('managerSettings.catalogue.cateringPackages') }));
    const packageEditors = snapshot.catalogue.cateringPackages.map(packageEditor);
    packageEditors.forEach((editor) => form.appendChild(editor.node));

    form.appendChild(el('h3', { text: t('managerSettings.catalogue.roomPrices') }));
    const priceByRoom = new Map(snapshot.catalogue.roomPrices.map((entry) => [entry.roomId, entry.price]));
    const defaultCurrency = snapshot.catalogue.roomPrices[0]?.price.currency
      || snapshot.catalogue.services[0]?.price.currency
      || 'EUR';
    const roomPriceEditors = locationSnapshot.configuration.rooms.map((room, index) => {
      const controls = priceControls(priceByRoom.get(room.id) || { amountMinor: 0, currency: defaultCurrency });
      const node = el('fieldset', { className: 'card', dataset: { roomPriceId: room.id } }, [
        el('legend', { text: room.name || room.id }),
        el('div', { className: 'form-grid' }, [
          field({ id: `manager-room-price-amount-${index}`, label: t('managerSettings.catalogue.amountMinor'), control: controls.amountMinor, required: true }),
          field({ id: `manager-room-price-currency-${index}`, label: t('managerSettings.catalogue.currency'), control: controls.currency, required: true }),
        ]),
      ]);
      return { room, controls, node };
    });
    if (!roomPriceEditors.length) form.appendChild(el('p', { className: 'muted', text: t('managerSettings.catalogue.noRooms') }));
    roomPriceEditors.forEach((editor) => form.appendChild(editor.node));

    const save = button(t('managerSettings.save'), { className: 'primary', attrs: { type: 'submit' } });
    form.appendChild(el('div', { className: 'button-row' }, [save]));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      save.disabled = true;
      try {
        const next = {
          services: editorsByCollection.services.map(commonEntryValue),
          equipment: editorsByCollection.equipment.map(commonEntryValue),
          cateringItems: editorsByCollection.cateringItems.map(commonEntryValue),
          cateringPackages: packageEditors.map(packageValue),
          roomPrices: roomPriceEditors.map(({ room, controls }) => ({
            roomId: room.id,
            price: priceFromControls(controls),
          })),
        };
        await catalogue.saveCatalogue({ expectedRevision: snapshot.revision, catalogue: next });
        showToast(t('managerSettings.saved'));
        await renderManagerSettings();
      } catch (error) {
        save.disabled = false;
        showToast(error?.currentRevision ? t('managerSettings.conflict') : t('managerSettings.error'));
      }
    });
    appRoot.append(form, renderHistory(historyPage.entries || []));
  }

  async function renderManagerSettings() {
    renderRevision += 1;
    const revision = renderRevision;
    if (section === 'catalogue') await renderCatalogue(revision);
    else await renderRooms(revision);
  }

  return Object.freeze({ renderManagerSettings });
}

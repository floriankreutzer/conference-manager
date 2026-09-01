import { projectRoomBusinessConfiguration } from '../core/tenant-location-ownership.js';
import { currency as tenantCurrency, formatDateTime, t } from '../core/i18n.js';
import { button, clear, el, field, showToast } from '../core/ui.js';
import { createBulkTransferPanel, supportsBulkTransfer } from '../shared/tenant-bulk-transfer-panel.js';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ASSET_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CURRENCIES = Object.freeze(['CHF', 'EUR', 'GBP', 'USD']);
const COLLECTION_LIMITS = Object.freeze({
  services: 200,
  equipment: 200,
  cateringItems: 300,
  cateringPackages: 100,
});
const PACKAGE_VARIANT_LIMIT = 20;

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

export function nextStableCatalogueId(prefix, existingIds) {
  const existing = new Set(existingIds);
  const marker = `${prefix}-`;
  let index = [...existing].reduce((maximum, id) => {
    const suffix = id.startsWith(marker) ? id.slice(marker.length) : '';
    const value = /^[1-9]\d*$/.test(suffix) ? Number(suffix) : 0;
    return Number.isSafeInteger(value) ? Math.max(maximum, value) : maximum;
  }, 0) + 1;
  while (existing.has(`${prefix}-${index}`)) index += 1;
  const candidate = `${prefix}-${index}`;
  if (!SAFE_ID.test(candidate)) throw new RangeError('MANAGER_CATALOGUE_ID_EXHAUSTED');
  return candidate;
}

export function catalogueDefaultCurrency(catalogue) {
  const candidates = [
    ...(catalogue?.roomPrices || []).map((entry) => entry.price?.currency),
    ...(catalogue?.services || []).map((entry) => entry.price?.currency),
    ...(catalogue?.equipment || []).map((entry) => entry.price?.currency),
    ...(catalogue?.cateringItems || []).map((entry) => entry.price?.currency),
    ...(catalogue?.cateringPackages || []).map((entry) => entry.price?.currency),
    tenantCurrency(),
  ];
  return candidates.find((value) => CURRENCIES.includes(value)) || 'EUR';
}

export function createCatalogueEntryDraft({ collection, existingEntries, currency }) {
  if (!Object.hasOwn(COLLECTION_LIMITS, collection) || !CURRENCIES.includes(currency)) {
    throw new TypeError('MANAGER_CATALOGUE_ENTRY_DRAFT_INVALID');
  }
  const entries = Array.isArray(existingEntries) ? existingEntries : [];
  if (entries.length >= COLLECTION_LIMITS[collection]) {
    throw new RangeError('MANAGER_CATALOGUE_ENTRY_LIMIT_REACHED');
  }
  return {
    id: nextStableCatalogueId(collection, entries.map((entry) => entry.id)),
    name: t('managerSettings.catalogue.newEntry'),
    description: null,
    price: { amountMinor: 0, currency },
    active: true,
    order: entries.length + 1,
    siteIds: [],
    roomIds: [],
    ...(collection === 'cateringPackages' ? { itemIds: [], variants: [] } : {}),
  };
}

export function createCatalogueVariantDraft({ packageEntry, existingVariants }) {
  const variants = Array.isArray(existingVariants) ? existingVariants : [];
  if (!packageEntry || !SAFE_ID.test(packageEntry.id) || !CURRENCIES.includes(packageEntry.price?.currency)) {
    throw new TypeError('MANAGER_CATALOGUE_VARIANT_DRAFT_INVALID');
  }
  if (variants.length >= PACKAGE_VARIANT_LIMIT) {
    throw new RangeError('MANAGER_CATALOGUE_VARIANT_LIMIT_REACHED');
  }
  const existingIds = variants.map((variant) => variant.id);
  let id;
  try {
    id = nextStableCatalogueId(`${packageEntry.id}-variant`, existingIds);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    id = nextStableCatalogueId('variant', existingIds);
  }
  return {
    id,
    name: t('managerSettings.catalogue.newVariant'),
    description: null,
    price: { amountMinor: 0, currency: packageEntry.price.currency },
    active: true,
    order: variants.length + 1,
  };
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

function variantEditor(variant, prefix) {
  const controls = {
    name: textInput(variant.name, { required: 'required', maxlength: '160' }),
    description: el('textarea', { attrs: { maxlength: '1000' } }),
    price: priceControls(variant.price),
    active: checkbox(variant.active),
    order: numberInput(variant.order, { max: 100_000 }),
  };
  controls.description.value = variant.description || '';
  const node = el('fieldset', { dataset: { catalogueVariantId: variant.id } }, [
    el('legend', { text: variant.name }),
    el('p', { className: 'muted', text: variant.id }),
    el('div', { className: 'form-grid' }, [
      field({ id: `${prefix}-${variant.id}-name`, label: t('managerSettings.catalogue.name'), control: controls.name, required: true }),
      field({ id: `${prefix}-${variant.id}-description`, label: t('managerSettings.catalogue.descriptionField'), control: controls.description, optional: true }),
      field({ id: `${prefix}-${variant.id}-amount`, label: t('managerSettings.catalogue.amountMinor'), control: controls.price.amountMinor, required: true }),
      field({ id: `${prefix}-${variant.id}-currency`, label: t('managerSettings.catalogue.currency'), control: controls.price.currency, required: true }),
      field({ id: `${prefix}-${variant.id}-order`, label: t('managerSettings.catalogue.order'), control: controls.order, required: true }),
      field({ id: `${prefix}-${variant.id}-active`, label: t('managerSettings.catalogue.active'), control: controls.active }),
    ]),
  ]);
  return { variant, controls, node };
}

function variantValue(editor) {
  return {
    id: editor.variant.id,
    name: editor.controls.name.value.trim(),
    description: editor.controls.description.value.trim() || null,
    price: priceFromControls(editor.controls.price),
    active: editor.controls.active.checked,
    order: Number(editor.controls.order.value),
  };
}

function packageEditor(entry) {
  const editor = commonEntryEditor(entry, 'manager-catalogue-package');
  const itemIds = textInput(entry.itemIds.join(', '), { maxlength: '4000' });
  const variants = el('div');
  const variantEditors = entry.variants.map((variant) => (
    variantEditor(variant, `manager-catalogue-package-${entry.id}-variant`)
  ));
  variantEditors.forEach((variant) => variants.appendChild(variant.node));
  const addVariant = button(t('managerSettings.catalogue.addVariant'), {
    dataset: { addCatalogueVariant: entry.id },
  });
  addVariant.disabled = variantEditors.length >= PACKAGE_VARIANT_LIMIT;
  addVariant.addEventListener('click', () => {
    const variant = createCatalogueVariantDraft({
      packageEntry: {
        ...entry,
        price: priceFromControls(editor.controls.price),
      },
      existingVariants: variantEditors.map((variantEditorEntry) => variantEditorEntry.variant),
    });
    const nextEditor = variantEditor(variant, `manager-catalogue-package-${entry.id}-variant`);
    variantEditors.push(nextEditor);
    variants.appendChild(nextEditor.node);
    addVariant.disabled = variantEditors.length >= PACKAGE_VARIANT_LIMIT;
    nextEditor.controls.name.focus();
  });
  editor.node.append(
    field({
      id: `manager-catalogue-package-${entry.id}-items`,
      label: t('managerSettings.catalogue.itemIds'),
      control: itemIds,
      optional: true,
      hint: t('managerSettings.commaSeparated'),
    }),
    el('h4', { text: t('managerSettings.catalogue.variants') }),
    variants,
    el('div', { className: 'button-row' }, [addVariant]),
  );
  return { ...editor, itemIds, variantEditors };
}

function packageValue(editor) {
  return {
    ...commonEntryValue(editor),
    itemIds: commaList(editor.itemIds.value, { maximum: 300 }),
    variants: editor.variantEditors.map(variantValue),
  };
}

function renderHistory(entries) {
  const section = el('section', { className: 'card' }, [el('h3', { text: t('managerSettings.history') })]);
  if (!entries.length) return section;
  const list = el('ul');
  entries.slice(0, 10).forEach((entry) => list.appendChild(el('li', {
    text: t('managerSettings.historyEntry', {
      revision: entry.revision,
      changedAt: entry.changedAt || entry.effectiveAt
        ? formatDateTime(entry.changedAt || entry.effectiveAt)
        : '',
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

  function isCurrentRender(revision, renderRoot) {
    return revision === renderRevision
      && renderRoot.parentNode === appRoot
      && document.documentElement.dataset.sessionLocked !== 'true';
  }

  function focusCurrentHeading(revision, renderRoot, enabled) {
    if (!enabled) return;
    requestAnimationFrame(() => {
      if (isCurrentRender(revision, renderRoot)) {
        document.getElementById('viewTitle')?.focus();
      }
    });
  }

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
    rooms.addEventListener('click', () => {
      section = 'rooms';
      void renderManagerSettings({ focusHeading: true });
    });
    catalog.addEventListener('click', () => {
      section = 'catalogue';
      void renderManagerSettings({ focusHeading: true });
    });
    row.append(rooms, catalog);
    return row;
  }

  function renderLoading(renderRoot, titleKey, descriptionKey) {
    clear(renderRoot);
    setPageHeading(t(titleKey), t(descriptionKey));
    renderRoot.append(sectionNavigation(), el('section', {
      className: 'card',
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-busy': 'true' },
    }, [el('p', { text: t('managerSettings.loading') })]));
  }

  function renderFailure(revision, renderRoot, retry, focusHeading) {
    clear(renderRoot);
    renderRoot.append(sectionNavigation(), el('section', { className: 'card' }, [
      el('p', { className: 'error-box', text: t('managerSettings.error') }),
      (() => {
        const action = button(t('managerSettings.retry'), { className: 'primary' });
        action.addEventListener('click', retry);
        return el('div', { className: 'button-row' }, [action]);
      })(),
    ]));
    focusCurrentHeading(revision, renderRoot, focusHeading);
  }

  async function renderRooms(revision, renderRoot, focusHeading) {
    renderLoading(renderRoot, 'managerSettings.rooms.title', 'managerSettings.rooms.description');
    let snapshot;
    let history;
    try {
      [snapshot, history] = await Promise.all([
        locations.loadLocations(),
        locations.listLocationsHistory({ limit: 20 }),
      ]);
    } catch {
      if (isCurrentRender(revision, renderRoot)) {
        renderFailure(
          revision,
          renderRoot,
          () => void renderManagerSettings({ focusHeading: true }),
          focusHeading,
        );
      }
      return;
    }
    if (!isCurrentRender(revision, renderRoot) || section !== 'rooms') return;
    clear(renderRoot);
    setPageHeading(t('managerSettings.rooms.title'), t('managerSettings.rooms.description'));
    renderRoot.appendChild(sectionNavigation());
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
        if (!isCurrentRender(revision, renderRoot) || section !== 'rooms') return;
        showToast(t('managerSettings.saved'));
        await renderManagerSettings({ focusHeading: true });
      } catch (error) {
        if (!isCurrentRender(revision, renderRoot) || section !== 'rooms') return;
        save.disabled = false;
        showToast(error?.currentRevision ? t('managerSettings.conflict') : t('managerSettings.error'));
      }
    });
    renderRoot.appendChild(form);
    if (supportsBulkTransfer(locations)) {
      renderRoot.appendChild(createBulkTransferPanel({
        adapter: locations,
        types: ['rooms'],
        rerender: () => {
          if (isCurrentRender(revision, renderRoot) && section === 'rooms') {
            void renderManagerSettings({ focusHeading: true });
          }
        },
        isCurrent: () => isCurrentRender(revision, renderRoot) && section === 'rooms',
      }));
    }
    renderRoot.appendChild(renderHistory(history));
    focusCurrentHeading(revision, renderRoot, focusHeading);
  }

  async function renderCatalogue(revision, renderRoot, focusHeading) {
    renderLoading(renderRoot, 'managerSettings.catalogue.title', 'managerSettings.catalogue.description');
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
      if (isCurrentRender(revision, renderRoot)) {
        renderFailure(
          revision,
          renderRoot,
          () => void renderManagerSettings({ focusHeading: true }),
          focusHeading,
        );
      }
      return;
    }
    if (!isCurrentRender(revision, renderRoot) || section !== 'catalogue') return;
    clear(renderRoot);
    setPageHeading(t('managerSettings.catalogue.title'), t('managerSettings.catalogue.description'));
    renderRoot.appendChild(sectionNavigation());
    const form = el('form');
    const sections = [
      ['services', 'managerSettings.catalogue.services'],
      ['equipment', 'managerSettings.catalogue.equipment'],
      ['cateringItems', 'managerSettings.catalogue.cateringItems'],
    ];
    const editorsByCollection = {};
    const defaultCurrency = catalogueDefaultCurrency(snapshot.catalogue);
    sections.forEach(([collection, titleKey]) => {
      const surface = el('div');
      const editors = snapshot.catalogue[collection].map((entry) => commonEntryEditor(entry, `manager-catalogue-${collection}`));
      editorsByCollection[collection] = editors;
      editors.forEach((editor) => surface.appendChild(editor.node));
      const add = button(t('managerSettings.catalogue.addEntry'), {
        dataset: { addCatalogueEntry: collection },
      });
      add.disabled = editors.length >= COLLECTION_LIMITS[collection];
      add.addEventListener('click', () => {
        const entry = createCatalogueEntryDraft({
          collection,
          existingEntries: editors.map((editor) => editor.entry),
          currency: defaultCurrency,
        });
        const editor = commonEntryEditor(entry, `manager-catalogue-${collection}`);
        editors.push(editor);
        surface.appendChild(editor.node);
        add.disabled = editors.length >= COLLECTION_LIMITS[collection];
        editor.controls.name.focus();
      });
      form.append(
        el('h3', { text: t(titleKey) }),
        surface,
        el('div', { className: 'button-row' }, [add]),
      );
    });
    form.appendChild(el('h3', { text: t('managerSettings.catalogue.cateringPackages') }));
    const packageEditors = snapshot.catalogue.cateringPackages.map(packageEditor);
    const packageSurface = el('div');
    packageEditors.forEach((editor) => packageSurface.appendChild(editor.node));
    const addPackage = button(t('managerSettings.catalogue.addEntry'), {
      dataset: { addCatalogueEntry: 'cateringPackages' },
    });
    addPackage.disabled = packageEditors.length >= COLLECTION_LIMITS.cateringPackages;
    addPackage.addEventListener('click', () => {
      const entry = createCatalogueEntryDraft({
        collection: 'cateringPackages',
        existingEntries: packageEditors.map((editor) => editor.entry),
        currency: defaultCurrency,
      });
      const editor = packageEditor(entry);
      packageEditors.push(editor);
      packageSurface.appendChild(editor.node);
      addPackage.disabled = packageEditors.length >= COLLECTION_LIMITS.cateringPackages;
      editor.controls.name.focus();
    });
    form.append(packageSurface, el('div', { className: 'button-row' }, [addPackage]));

    form.appendChild(el('h3', { text: t('managerSettings.catalogue.roomPrices') }));
    const priceByRoom = new Map(snapshot.catalogue.roomPrices.map((entry) => [entry.roomId, entry.price]));
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
        if (!isCurrentRender(revision, renderRoot) || section !== 'catalogue') return;
        showToast(t('managerSettings.saved'));
        await renderManagerSettings({ focusHeading: true });
      } catch (error) {
        if (!isCurrentRender(revision, renderRoot) || section !== 'catalogue') return;
        save.disabled = false;
        showToast(error?.currentRevision ? t('managerSettings.conflict') : t('managerSettings.error'));
      }
    });
    renderRoot.append(form);
    if (supportsBulkTransfer(catalogue)) {
      renderRoot.appendChild(createBulkTransferPanel({
        adapter: catalogue,
        types: ['services', 'catering-items', 'catering-packages'],
        rerender: () => {
          if (isCurrentRender(revision, renderRoot) && section === 'catalogue') {
            void renderManagerSettings({ focusHeading: true });
          }
        },
        isCurrent: () => isCurrentRender(revision, renderRoot) && section === 'catalogue',
      }));
    }
    renderRoot.appendChild(renderHistory(historyPage.revisions || []));
    focusCurrentHeading(revision, renderRoot, focusHeading);
  }

  async function renderManagerSettings({ focusHeading = false } = {}) {
    renderRevision += 1;
    const revision = renderRevision;
    const renderRoot = el('section', { dataset: { managerBusinessSettingsRoot: String(revision) } });
    clear(appRoot);
    appRoot.appendChild(renderRoot);
    if (section === 'catalogue') await renderCatalogue(revision, renderRoot, focusHeading);
    else await renderRooms(revision, renderRoot, focusHeading);
  }

  return Object.freeze({ renderManagerSettings });
}

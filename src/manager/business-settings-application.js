import { createPublicGuestValueEditor } from '../core/public-guest-value-editor.js';
import { projectRoomBusinessConfiguration } from '../core/tenant-location-ownership.js';
import { currency as tenantCurrency, formatDateTime, t } from '../core/i18n.js';
import { button, clear, el, field, showToast } from '../core/ui.js';
import { createBulkTransferPanel, supportsBulkTransfer } from '../shared/tenant-bulk-transfer-panel.js';
import { authorityFailureCode } from '../shared/authority-failure.js';
import { RUNTIME_MODE, runtimeModeFromDocument } from '../core/security-policy.js';

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
const ROOM_BUSINESS_FIELDS = Object.freeze([
  'name', 'capacity', 'active', 'floor', 'equipment', 'accessibility', 'serviceIds',
  'cateringPackageIds', 'floorplanAssetId', 'mediaAssetIds', 'guestPublicValues',
]);

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

function numberInput(value, { min = 0, max = 1_000_000_000, required = true } = {}) {
  const attrs = { min: String(min), max: String(max), step: '1' };
  if (required) attrs.required = 'required';
  return el('input', {
    type: 'number',
    value,
    attrs,
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

function requiredTrimmedTextField({ id, label, value, message }) {
  const control = textInput(value, { required: 'required', maxlength: '160' });
  const errorId = `${id}-error`;
  control.setAttribute('aria-describedby', errorId);
  const error = el('small', {
    id: errorId,
    className: 'field-error',
    attrs: { role: 'alert', 'aria-live': 'assertive' },
  });
  const node = field({ id, label, control, required: true });
  node.appendChild(error);
  let validationActive = false;
  function presentValidity(valid) {
    control.setCustomValidity(valid ? '' : message);
    if (valid) {
      control.removeAttribute('aria-invalid');
      error.textContent = '';
    } else {
      control.setAttribute('aria-invalid', 'true');
      error.textContent = message;
    }
  }
  control.addEventListener('input', () => {
    if (!validationActive) return;
    const valid = Boolean(control.value.trim());
    presentValidity(valid);
    if (valid) validationActive = false;
  });
  return {
    control,
    node,
    validate() {
      const valid = Boolean(control.value.trim());
      validationActive = !valid;
      presentValidity(valid);
      return valid;
    },
  };
}

function validateRequiredTrimmedText(fields) {
  let firstInvalid = null;
  fields.forEach((entry) => {
    if (!entry.validate() && !firstInvalid) firstInvalid = entry;
  });
  if (!firstInvalid) return true;
  firstInvalid.control.focus();
  firstInvalid.control.reportValidity();
  return false;
}

function priceControls(price, { amountRequired = true } = {}) {
  const attrs = { min: '0', max: '10000000', step: '0.01', inputmode: 'decimal' };
  if (amountRequired) attrs.required = 'required';
  const amountMinor = el('input', {
    type: 'number',
    value: price.amountMinor === '' ? '' : (Number(price.amountMinor) / 100).toFixed(2),
    attrs,
  });
  const currency = el('select', {}, CURRENCIES.map((value) => el('option', { value, text: value })));
  currency.value = price.currency;
  return { amountMinor, currency };
}

function minorUnitsFromAmount(value, code = 'MANAGER_PRICE_INVALID') {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(raw)) throw new TypeError(code);
  const amountMinor = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || amountMinor > 1_000_000_000) {
    throw new TypeError(code);
  }
  return amountMinor;
}

function priceFromControls(controls) {
  const amountMinor = minorUnitsFromAmount(controls.amountMinor.value);
  if (amountMinor === null) throw new TypeError('MANAGER_PRICE_REQUIRED');
  return { amountMinor, currency: controls.currency.value };
}

export function catalogueRoomPriceValue(roomId, amount, currency) {
  const amountMinor = minorUnitsFromAmount(amount, 'MANAGER_ROOM_PRICE_INVALID');
  if (amountMinor === null) return null;
  if (!CURRENCIES.includes(currency)) throw new TypeError('MANAGER_ROOM_PRICE_INVALID');
  return { roomId, price: { amountMinor, currency } };
}

function commonEntryEditor(entry, prefix) {
  const nameField = requiredTrimmedTextField({
    id: `${prefix}-${entry.id}-name`,
    label: t('managerSettings.catalogue.name'),
    value: entry.name,
    message: t('managerSettings.validation.catalogueNameRequired'),
  });
  const controls = {
    name: nameField.control,
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
      nameField.node,
      field({ id: `${prefix}-${entry.id}-description`, label: t('managerSettings.catalogue.descriptionField'), control: controls.description, optional: true }),
      field({ id: `${prefix}-${entry.id}-amount`, label: t('managerSettings.catalogue.amountMinor'), control: controls.price.amountMinor, required: true, hint: t('managerSettings.help.price') }),
      field({ id: `${prefix}-${entry.id}-currency`, label: t('managerSettings.catalogue.currency'), control: controls.price.currency, required: true, hint: t('managerSettings.help.currency') }),
      field({ id: `${prefix}-${entry.id}-order`, label: t('managerSettings.catalogue.order'), control: controls.order, required: true, hint: t('managerSettings.help.order') }),
      field({ id: `${prefix}-${entry.id}-sites`, label: t('managerSettings.catalogue.siteIds'), control: controls.siteIds, optional: true, hint: t('managerSettings.help.sites') }),
      field({ id: `${prefix}-${entry.id}-rooms`, label: t('managerSettings.catalogue.roomIds'), control: controls.roomIds, optional: true, hint: t('managerSettings.help.rooms') }),
      field({ id: `${prefix}-${entry.id}-active`, label: t('managerSettings.catalogue.active'), control: controls.active }),
    ]),
  ]);
  return { entry, controls, nameField, node };
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
  const nameField = requiredTrimmedTextField({
    id: `${prefix}-${variant.id}-name`,
    label: t('managerSettings.catalogue.name'),
    value: variant.name,
    message: t('managerSettings.validation.catalogueNameRequired'),
  });
  const controls = {
    name: nameField.control,
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
      nameField.node,
      field({ id: `${prefix}-${variant.id}-description`, label: t('managerSettings.catalogue.descriptionField'), control: controls.description, optional: true }),
      field({ id: `${prefix}-${variant.id}-amount`, label: t('managerSettings.catalogue.amountMinor'), control: controls.price.amountMinor, required: true }),
      field({ id: `${prefix}-${variant.id}-currency`, label: t('managerSettings.catalogue.currency'), control: controls.price.currency, required: true }),
      field({ id: `${prefix}-${variant.id}-order`, label: t('managerSettings.catalogue.order'), control: controls.order, required: true }),
      field({ id: `${prefix}-${variant.id}-active`, label: t('managerSettings.catalogue.active'), control: controls.active }),
    ]),
  ]);
  return { variant, controls, nameField, node };
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
  onAuthorityFailure,
} = {}) {
  if (!appRoot || typeof setPageHeading !== 'function') {
    throw new TypeError('MANAGER_BUSINESS_SETTINGS_ROOT_REQUIRED');
  }
  if (!validLocationsAdapter(locations) || !validCatalogueAdapter(catalogue)) {
    throw new TypeError('MANAGER_BUSINESS_SETTINGS_ADAPTER_REQUIRED');
  }
  if (typeof onAuthorityFailure !== 'function') {
    throw new TypeError('MANAGER_BUSINESS_SETTINGS_AUTHORITY_HANDLER_REQUIRED');
  }
  let section = 'rooms';
  let renderRevision = 0;
  const demoRuntime = runtimeModeFromDocument(document) === RUNTIME_MODE.DEMO;

  function demoCateringImage(editor, media, ownerKind, revision, renderRoot) {
    if (!demoRuntime) return;
    const canCreate = typeof catalogue.createDemoCatalogueImage === 'function';
    const canReplace = typeof catalogue.replaceDemoCatalogueImage === 'function';
    const canRemove = typeof catalogue.removeDemoCatalogueImage === 'function';
    if ((!media && !canCreate) || (media && !canReplace)) return;
    const surface = el('section', { className: 'room-asset-panel' });
    const preview = media ? el('img', {
      className: 'room-asset-visual media',
      attrs: { src: media.url, alt: media.altText, loading: 'lazy', referrerpolicy: 'no-referrer' },
    }) : null;
    if (preview) surface.appendChild(preview);
    const picker = el('input', {
      type: 'file',
      attrs: { accept: media ? 'image/webp' : 'image/png,image/jpeg,image/webp' },
    });
    const save = button(t(media
      ? 'managerSettings.catalogue.imageReplace'
      : 'managerSettings.catalogue.imageCreate'));
    save.addEventListener('click', async () => {
      if (!picker.files?.[0]) { picker.focus(); return; }
      save.disabled = true;
      try {
        if (media) await catalogue.replaceDemoCatalogueImage(media.id, picker.files[0]);
        else await catalogue.createDemoCatalogueImage(ownerKind, editor.entry.id, picker.files[0]);
        if (!isCurrentRender(revision, renderRoot) || section !== 'catering') return;
        if (preview) {
          preview.removeAttribute('src');
          preview.src = media.url;
          picker.value = '';
          save.disabled = false;
          showToast(t('managerSettings.catalogue.imageSaved'));
        } else {
          showToast(t('managerSettings.catalogue.imageSaved'));
          await renderManagerSettings({ focusHeading: true });
        }
      } catch (error) {
        if (handleAuthorityFailure(error)) return;
        if (!isCurrentRender(revision, renderRoot)) return;
        save.disabled = false;
        showToast(t('managerSettings.catalogue.imageError'));
      }
    });
    const imageFileLabel = media
      ? t('managerSettings.catalogue.imageFile')
      : t('managerSettings.catalogue.imageCreateFile');
    surface.append(field({
      id: `manager-catering-image-${media?.id || editor.entry.id}`,
      label: imageFileLabel, control: picker, optional: true,
      hint: media ? undefined : t('managerSettings.catalogue.imageCreateHint'),
    }), save);
    if (media && canRemove) {
      const remove = button(t('managerSettings.catalogue.imageRemove'), { className: 'secondary' });
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try {
          await catalogue.removeDemoCatalogueImage(media.id);
          if (!isCurrentRender(revision, renderRoot)) return;
          surface.remove();
          showToast(t('managerSettings.catalogue.imageRemoved'));
        } catch (error) {
          if (handleAuthorityFailure(error)) return;
          if (!isCurrentRender(revision, renderRoot)) return;
          remove.disabled = false;
          showToast(t('managerSettings.catalogue.imageError'));
        }
      });
      surface.appendChild(remove);
    }
    editor.node.appendChild(surface);
  }

  function isCurrentRender(revision, renderRoot) {
    return revision === renderRevision
      && appRoot.isConnected
      && renderRoot.isConnected
      && renderRoot.parentNode === appRoot
      && document.documentElement.dataset.sessionLocked !== 'true';
  }

  function handleAuthorityFailure(error) {
    if (!authorityFailureCode(error)) return false;
    onAuthorityFailure(error);
    return true;
  }

  function authorityAwareBulkAdapter(adapter) {
    return Object.freeze(Object.fromEntries([
      'loadBulkTemplate',
      'exportBulk',
      'validateBulk',
      'applyBulk',
    ].map((method) => [method, async (...args) => {
      try {
        return await adapter[method](...args);
      } catch (error) {
        if (authorityFailureCode(error)) onAuthorityFailure(error);
        throw error;
      }
    }])));
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
    const row = el('div', {
      className: 'button-row manager-business-settings-nav',
      attrs: { role: 'navigation', 'aria-label': t('managerSettings.title') },
    });
    for (const target of ['rooms', 'services', 'catering']) {
      const control = button(t(`managerSettings.section.${target}`), {
        className: section === target ? 'primary' : '',
        attrs: section === target ? { 'aria-current': 'page' } : {},
      });
      control.addEventListener('click', () => {
        section = target;
        void renderManagerSettings({ focusHeading: true });
      });
      row.appendChild(control);
    }
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
    let catalogueSnapshot;
    try {
      [snapshot, history, catalogueSnapshot] = await Promise.all([
        locations.loadLocations({ schemaVersion: 3 }),
        locations.listLocationsHistory({ limit: 20 }),
        catalogue.loadCatalogue(),
      ]);
    } catch (error) {
      if (handleAuthorityFailure(error)) return;
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
      const nameField = requiredTrimmedTextField({
        id: `manager-room-name-${index}`,
        label: t('managerSettings.room.name'),
        value: room.name,
        message: t('managerSettings.validation.roomNameRequired'),
      });
      const controls = {
        name: nameField.control,
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
      if (Object.hasOwn(room, 'description')) {
        controls.description = el('textarea', { attrs: { maxlength: '1000' } });
        controls.description.value = room.description ?? '';
      }
      const publicGuest = createPublicGuestValueEditor(room.guestPublicValues, index, 'room');
      const site = siteById.get(room.siteId);
      const existingRoomPrice = catalogueSnapshot.catalogue.roomPrices
        .find((entry) => entry.roomId === room.id)?.price;
      const roomPrice = priceControls(existingRoomPrice || {
        amountMinor: '', currency: catalogueDefaultCurrency(catalogueSnapshot.catalogue),
      }, { amountRequired: false });
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
          nameField.node,
          ...(controls.description ? [field({
            id: `manager-room-description-${index}`,
            label: t('managerSettings.room.description'),
            control: controls.description,
            optional: true,
          })] : []),
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
      node.appendChild(publicGuest.node);
      const roomPricePanel = el('section', { className: 'room-asset-panel' }, [
        el('h3', { text: t('managerSettings.room.priceHeading') }),
        el('p', { className: 'field-hint', text: t('managerSettings.room.priceHint') }),
        el('div', { className: 'form-grid' }, [
          field({
            id: `manager-room-price-amount-${index}`,
            label: t('managerSettings.catalogue.price'),
            control: roomPrice.amountMinor,
            optional: true,
          }),
          field({
            id: `manager-room-price-currency-${index}`,
            label: t('managerSettings.catalogue.currency'),
            control: roomPrice.currency,
            optional: true,
          }),
        ]),
      ]);
      const savePrice = button(t('managerSettings.room.savePrice'), { className: 'secondary' });
      savePrice.addEventListener('click', async () => {
        savePrice.disabled = true;
        try {
          const nextPrice = catalogueRoomPriceValue(
            room.id, roomPrice.amountMinor.value, roomPrice.currency.value,
          );
          const roomPrices = catalogueSnapshot.catalogue.roomPrices
            .filter((entry) => entry.roomId !== room.id);
          if (nextPrice) roomPrices.push(nextPrice);
          await catalogue.saveCatalogue({
            expectedRevision: catalogueSnapshot.revision,
            catalogue: { ...catalogueSnapshot.catalogue, roomPrices },
          });
          if (!isCurrentRender(revision, renderRoot) || section !== 'rooms') return;
          showToast(t('managerSettings.room.priceSaved'));
          await renderManagerSettings({ focusHeading: true });
        } catch (error) {
          if (handleAuthorityFailure(error)) return;
          if (!isCurrentRender(revision, renderRoot) || section !== 'rooms') return;
          savePrice.disabled = false;
          showToast(error?.currentRevision ? t('managerSettings.conflict') : t('managerSettings.error'));
        }
      });
      roomPricePanel.appendChild(savePrice);
      node.appendChild(roomPricePanel);
      if (typeof locations.uploadRoomMedia === 'function') {
        const uploadPanel = el('section', { className: 'room-asset-panel' });
        uploadPanel.appendChild(el('h3', { text: t('managerSettings.room.mediaUploadHeading') }));
        for (const kind of ['floorplan', 'media']) {
          const picker = el('input', {
            type: 'file',
            attrs: { accept: 'image/png,image/jpeg,image/webp' },
          });
          const upload = button(t(`managerSettings.room.upload.${kind}`), { className: 'secondary' });
          upload.addEventListener('click', async () => {
            if (!picker.files?.[0]) {
              picker.focus();
              return;
            }
            if (kind === 'media' && room.mediaAssetIds.length >= 20) {
              showToast(t('managerSettings.room.mediaLimit'));
              return;
            }
            upload.disabled = true;
            try {
              const assetId = await locations.uploadRoomMedia(room.id, picker.files[0]);
              const edits = snapshot.configuration.rooms.map((entry) => ({
                id: entry.id,
                ...Object.fromEntries(ROOM_BUSINESS_FIELDS.map((key) => [key, entry[key]])),
                ...(entry.id === room.id ? (kind === 'floorplan'
                  ? { floorplanAssetId: assetId }
                  : { mediaAssetIds: [...entry.mediaAssetIds, assetId] }) : {}),
              }));
              const configuration = projectRoomBusinessConfiguration(snapshot.configuration, edits);
              await locations.saveLocations({ schemaVersion: 3, expectedRevision: snapshot.revision, configuration });
              if (!isCurrentRender(revision, renderRoot) || section !== 'rooms') return;
              showToast(t('managerSettings.room.mediaUploaded'));
              await renderManagerSettings({ focusHeading: true });
            } catch (error) {
              if (handleAuthorityFailure(error)) return;
              if (!isCurrentRender(revision, renderRoot) || section !== 'rooms') return;
              upload.disabled = false;
              showToast(error?.currentRevision ? t('managerSettings.conflict') : t('managerSettings.room.mediaUploadError'));
            }
          });
          uploadPanel.appendChild(field({
            id: `manager-room-${kind}-upload-${index}`,
            label: t(`managerSettings.room.file.${kind}`),
            control: picker,
            optional: true,
          }));
          uploadPanel.appendChild(upload);
        }
        node.appendChild(uploadPanel);
      }
      return { room, controls, nameField, publicGuest, node };
    });
    const form = el('form');
    editors.forEach((editor) => form.appendChild(editor.node));
    const save = button(t('managerSettings.save'), { className: 'primary', attrs: { type: 'submit' } });
    form.appendChild(el('div', { className: 'button-row' }, [save]));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!validateRequiredTrimmedText(editors.map(({ nameField }) => nameField))) return;
      if (!form.reportValidity()) return;
      save.disabled = true;
      try {
        const roomEdits = editors.map(({ room, controls, publicGuest }) => {
          const floorplanAssetId = controls.floorplanAssetId.value.trim();
          if (floorplanAssetId && !ASSET_ID.test(floorplanAssetId)) throw new TypeError('MANAGER_ROOM_ASSET_INVALID');
          return {
            id: room.id,
            name: controls.name.value.trim(),
            ...(controls.description ? { description: controls.description.value.trim() || null } : {}),
            capacity: Number(controls.capacity.value),
            active: controls.active.checked,
            floor: controls.floor.value.trim() || null,
            equipment: commaList(controls.equipment.value, { maximum: 100, pattern: /^.{1,160}$/u }),
            accessibility: commaList(controls.accessibility.value, { maximum: 20, pattern: /^.{1,80}$/u }),
            serviceIds: commaList(controls.serviceIds.value, { maximum: 200 }),
            cateringPackageIds: commaList(controls.cateringPackageIds.value, { maximum: 200 }),
            floorplanAssetId: floorplanAssetId || null,
            mediaAssetIds: commaList(controls.mediaAssetIds.value, { maximum: 20, pattern: ASSET_ID }),
            guestPublicValues: publicGuest.readValue(),
          };
        });
        const configuration = projectRoomBusinessConfiguration(snapshot.configuration, roomEdits);
        await locations.saveLocations({ schemaVersion: 3, expectedRevision: snapshot.revision, configuration });
        if (!isCurrentRender(revision, renderRoot) || section !== 'rooms') return;
        showToast(t('managerSettings.saved'));
        await renderManagerSettings({ focusHeading: true });
      } catch (error) {
        if (handleAuthorityFailure(error)) return;
        if (!isCurrentRender(revision, renderRoot) || section !== 'rooms') return;
        save.disabled = false;
        showToast(error?.currentRevision ? t('managerSettings.conflict') : t('managerSettings.error'));
      }
    });
    renderRoot.appendChild(form);
    if (supportsBulkTransfer(locations)) {
      renderRoot.appendChild(createBulkTransferPanel({
        adapter: authorityAwareBulkAdapter(locations),
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
    renderLoading(renderRoot,
      section === 'services' ? 'managerSettings.services.title' : 'managerSettings.catering.title',
      section === 'services' ? 'managerSettings.services.description' : 'managerSettings.catering.description');
    let snapshot;
    let locationSnapshot;
    let historyPage;
    try {
      [snapshot, locationSnapshot, historyPage] = await Promise.all([
        catalogue.loadCatalogue(),
        locations.loadLocations(),
        catalogue.listCatalogueHistory({ limit: 20 }),
      ]);
    } catch (error) {
      if (handleAuthorityFailure(error)) return;
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
    if (!isCurrentRender(revision, renderRoot) || !['services', 'catering'].includes(section)) return;
    let demoMedia = [];
    if (demoRuntime && typeof catalogue.listDemoMedia === 'function') {
      try {
        const response = await catalogue.listDemoMedia();
        if (!Array.isArray(response?.assets) || response.assets.length > 40) throw new TypeError('DEMO_MEDIA_INVALID');
        demoMedia = response.assets.filter((asset) =>
          ['catering_item', 'catering_package'].includes(asset?.ownerKind)
          && typeof asset.ownerId === 'string'
          && typeof asset.id === 'string' && /^[0-9a-f-]{36}$/i.test(asset.id)
          && asset.url === `/api/v1/demo/media/${asset.id}`
          && asset.contentType === 'image/webp' && typeof asset.altText === 'string');
      } catch (error) {
        if (handleAuthorityFailure(error)) return;
        demoMedia = null;
      }
    }
    if (!isCurrentRender(revision, renderRoot) || !['services', 'catering'].includes(section)) return;
    clear(renderRoot);
    setPageHeading(
      t(section === 'services' ? 'managerSettings.services.title' : 'managerSettings.catering.title'),
      t(section === 'services' ? 'managerSettings.services.description' : 'managerSettings.catering.description'),
    );
    renderRoot.appendChild(sectionNavigation());
    const form = el('form');
    const sections = section === 'services'
      ? [
        ['services', 'managerSettings.catalogue.services'],
        ['equipment', 'managerSettings.catalogue.equipment'],
      ]
      : [['cateringItems', 'managerSettings.catalogue.cateringItems']];
    const editorsByCollection = {};
    const defaultCurrency = catalogueDefaultCurrency(snapshot.catalogue);
    sections.forEach(([collection, titleKey]) => {
      const surface = el('div');
      const editors = snapshot.catalogue[collection].map((entry) => commonEntryEditor(entry, `manager-catalogue-${collection}`));
      editorsByCollection[collection] = editors;
      editors.forEach((editor) => surface.appendChild(editor.node));
      if (collection === 'cateringItems' && demoMedia) {
        for (const editor of editors) demoCateringImage(editor,
          demoMedia.find((asset) => asset.ownerKind === 'catering_item' && asset.ownerId === editor.entry.id),
          'catering-item', revision, renderRoot);
      }
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
    if (section === 'catering') form.appendChild(el('h3', { text: t('managerSettings.catalogue.cateringPackages') }));
    const packageEditors = snapshot.catalogue.cateringPackages.map(packageEditor);
    const packageSurface = el('div');
    packageEditors.forEach((editor) => packageSurface.appendChild(editor.node));
    if (demoMedia) {
      for (const editor of packageEditors) demoCateringImage(editor,
        demoMedia.find((asset) => asset.ownerKind === 'catering_package' && asset.ownerId === editor.entry.id),
        'catering-package', revision, renderRoot);
    }
    if (demoMedia === null) form.appendChild(el('p', {
      className: 'error-box', text: t('managerSettings.catalogue.imageLoadError'),
    }));
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
    if (section === 'catering') {
      form.append(packageSurface, el('div', { className: 'button-row' }, [addPackage]));
    }

    /* Room prices are edited with Rooms; preserve them here. */
    const roomPriceEditors = [];
    /* legacy room-price editor removed from Catalogue presentation */
    const legacyRoomPriceSection = false;
    if (legacyRoomPriceSection) form.appendChild(el('h3', { text: t('managerSettings.catalogue.roomPrices') }));

    const save = button(t('managerSettings.save'), { className: 'primary', attrs: { type: 'submit' } });
    form.appendChild(el('div', { className: 'button-row' }, [save]));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const catalogueNameFields = [
        ...Object.values(editorsByCollection).flatMap((editors) => (
          editors.map(({ nameField }) => nameField)
        )),
        ...packageEditors.flatMap((editor) => [
          editor.nameField,
          ...editor.variantEditors.map(({ nameField }) => nameField),
        ]),
      ];
      if (!validateRequiredTrimmedText(catalogueNameFields)) return;
      if (!form.reportValidity()) return;
      save.disabled = true;
      try {
        const next = {
          services: section === 'services'
            ? editorsByCollection.services.map(commonEntryValue) : snapshot.catalogue.services,
          equipment: section === 'services'
            ? editorsByCollection.equipment.map(commonEntryValue) : snapshot.catalogue.equipment,
          cateringItems: section === 'catering'
            ? editorsByCollection.cateringItems.map(commonEntryValue) : snapshot.catalogue.cateringItems,
          cateringPackages: section === 'catering'
            ? packageEditors.map(packageValue) : snapshot.catalogue.cateringPackages,
          roomPrices: snapshot.catalogue.roomPrices,
        };
        await catalogue.saveCatalogue({ expectedRevision: snapshot.revision, catalogue: next });
        if (!isCurrentRender(revision, renderRoot) || !['services', 'catering'].includes(section)) return;
        showToast(t('managerSettings.saved'));
        await renderManagerSettings({ focusHeading: true });
      } catch (error) {
        if (handleAuthorityFailure(error)) return;
        if (!isCurrentRender(revision, renderRoot) || !['services', 'catering'].includes(section)) return;
        save.disabled = false;
        showToast(error?.currentRevision ? t('managerSettings.conflict') : t('managerSettings.error'));
      }
    });
    renderRoot.append(form);
    if (supportsBulkTransfer(catalogue)) {
      renderRoot.appendChild(createBulkTransferPanel({
        adapter: authorityAwareBulkAdapter(catalogue),
        types: section === 'services'
          ? ['services', 'equipment'] : ['catering-items', 'catering-packages'],
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
    if (section === 'rooms') await renderRooms(revision, renderRoot, focusHeading);
    else await renderCatalogue(revision, renderRoot, focusHeading);
  }

  return Object.freeze({ renderManagerSettings });
}

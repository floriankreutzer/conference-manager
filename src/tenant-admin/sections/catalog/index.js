import { currency as tenantCurrency, formatDateTime, locale, t } from '../../../core/i18n.js';
import { announce, button, clear, el, field, showToast, validationSummary } from '../../../core/ui.js';
import { TENANT_ADMIN_SECTION_PERMISSION, defineTenantAdminSection } from '../../section-contract.js';
import { renderSectionConflict, renderSectionError, renderSectionLoading } from '../../section-presentation.js';
import { tenantSettingsConflictRevision } from '../../settings-revision.js';
import { createBulkTransferPanel, supportsBulkTransfer } from '../../bulk-transfer-panel.js';

export { createDemoCatalogueSettings } from './demo-adapter.js';

const TITLE = 'tenantAdmin.catalog.title';
const CATEGORIES = Object.freeze(['services', 'equipment', 'cateringItems', 'cateringPackages']);
const CURRENCIES = Object.freeze(['CHF', 'EUR', 'GBP', 'USD']);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function validAdapter(adapter) {
  return adapter !== null && ['loadCatalogue', 'saveCatalogue', 'listCatalogueHistory']
    .every((method) => typeof adapter?.[method] === 'function');
}

const textInput = (value, attrs = {}) => el('input', { type: 'text', value: value ?? '', attrs });
const checkbox = (checked) => el('input', { type: 'checkbox', checked });
const optional = (value) => value.trim() || null;
const commaIds = (value) => {
  const ids = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (new Set(ids).size !== ids.length || ids.some((id) => !SAFE_ID.test(id))) throw new TypeError('CATALOGUE_IDS_INVALID');
  return ids;
};
const nextId = (prefix, existing) => {
  let index = existing.size + 1;
  while (existing.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
};

function currencySelect(selected) {
  const control = el('select');
  CURRENCIES.forEach((currency) => control.appendChild(el('option', { value: currency, text: currency })));
  control.value = selected;
  return control;
}

function localizedPrice(amountMinor, currency) {
  return new Intl.NumberFormat(locale(), { style: 'currency', currency }).format(amountMinor / 100);
}

function variantEditor(variant, prefix, index) {
  const controls = {
    name: textInput(variant.name, { required: 'required', maxlength: '160' }),
    description: el('textarea', { value: variant.description ?? '', attrs: { maxlength: '1000' } }),
    amountMinor: el('input', { type: 'number', value: variant.price.amountMinor, attrs: { min: '0', max: '1000000000', step: '1', required: 'required' } }),
    currency: currencySelect(variant.price.currency),
    active: checkbox(variant.active),
    order: el('input', { type: 'number', value: variant.order, attrs: { min: '0', max: '100000', step: '1', required: 'required' } }),
  };
  const node = el('fieldset', { dataset: { catalogueVariantId: variant.id } }, [
    el('legend', { text: variant.name }),
    el('p', { className: 'muted', text: t('tenantSettings.catalogue.pricePreview', { price: localizedPrice(variant.price.amountMinor, variant.price.currency) }) }),
    el('div', { className: 'form-grid' }, [
      field({ id: `${prefix}-variant-name-${index}`, label: t('tenantSettings.catalogue.name'), control: controls.name, required: true }),
      field({ id: `${prefix}-variant-description-${index}`, label: t('tenantSettings.catalogue.description'), control: controls.description, optional: true }),
      field({ id: `${prefix}-variant-price-${index}`, label: t('tenantSettings.catalogue.amountMinor'), control: controls.amountMinor, required: true }),
      field({ id: `${prefix}-variant-currency-${index}`, label: t('tenantSettings.catalogue.currency'), control: controls.currency, required: true }),
      field({ id: `${prefix}-variant-order-${index}`, label: t('tenantSettings.catalogue.order'), control: controls.order, required: true }),
      field({ id: `${prefix}-variant-active-${index}`, label: t('tenantSettings.common.active'), control: controls.active }),
    ]),
  ]);
  return { node, controls, variant };
}

function entryEditor(entry, category, index) {
  const prefix = `tenant-catalogue-${category}-${index}`;
  const controls = {
    name: textInput(entry.name, { required: 'required', maxlength: '160' }),
    description: el('textarea', { value: entry.description ?? '', attrs: { maxlength: '1000' } }),
    amountMinor: el('input', { type: 'number', value: entry.price.amountMinor, attrs: { min: '0', max: '1000000000', step: '1', required: 'required' } }),
    currency: currencySelect(entry.price.currency),
    active: checkbox(entry.active),
    order: el('input', { type: 'number', value: entry.order, attrs: { min: '0', max: '100000', step: '1', required: 'required' } }),
    siteIds: textInput(entry.siteIds.join(', '), { maxlength: '2000' }),
    roomIds: textInput(entry.roomIds.join(', '), { maxlength: '2000' }),
  };
  const node = el('fieldset', { className: 'card', dataset: { catalogueEntryId: entry.id, catalogueCategory: category } });
  node.append(
    el('legend', { text: entry.name }),
    el('p', { className: 'muted', text: t('tenantSettings.catalogue.entrySummary', { id: entry.id, price: localizedPrice(entry.price.amountMinor, entry.price.currency) }) }),
    el('div', { className: 'form-grid' }, [
      field({ id: `${prefix}-name`, label: t('tenantSettings.catalogue.name'), control: controls.name, required: true }),
      field({ id: `${prefix}-description`, label: t('tenantSettings.catalogue.description'), control: controls.description, optional: true }),
      field({ id: `${prefix}-price`, label: t('tenantSettings.catalogue.amountMinor'), control: controls.amountMinor, required: true, hint: t('tenantSettings.catalogue.amountMinorHint') }),
      field({ id: `${prefix}-currency`, label: t('tenantSettings.catalogue.currency'), control: controls.currency, required: true }),
      field({ id: `${prefix}-order`, label: t('tenantSettings.catalogue.order'), control: controls.order, required: true }),
      field({ id: `${prefix}-site-ids`, label: t('tenantSettings.catalogue.siteIds'), control: controls.siteIds, optional: true, hint: t('tenantSettings.common.commaSeparated') }),
      field({ id: `${prefix}-room-ids`, label: t('tenantSettings.catalogue.roomIds'), control: controls.roomIds, optional: true, hint: t('tenantSettings.common.commaSeparated') }),
      field({ id: `${prefix}-active`, label: t('tenantSettings.common.active'), control: controls.active }),
    ]),
  );
  const variantEditors = [];
  if (category === 'cateringPackages') {
    controls.itemIds = textInput(entry.itemIds.join(', '), { maxlength: '3000' });
    node.appendChild(field({ id: `${prefix}-item-ids`, label: t('tenantSettings.catalogue.itemIds'), control: controls.itemIds, optional: true, hint: t('tenantSettings.common.commaSeparated') }));
    const variants = el('div');
    entry.variants.forEach((variant, variantIndex) => {
      const editor = variantEditor(variant, prefix, variantIndex);
      variantEditors.push(editor);
      variants.appendChild(editor.node);
    });
    const addVariant = button(t('tenantSettings.catalogue.addVariant'));
    addVariant.addEventListener('click', () => {
      const count = variantEditors.length + 1;
      const id = nextId(`${entry.id}-variant`, new Set(variantEditors.map(({ variant }) => variant.id)));
      const editor = variantEditor({ id, name: t('tenantSettings.catalogue.newVariant'), description: null, price: { amountMinor: 0, currency: entry.price.currency }, active: true, order: count }, prefix, count - 1);
      variantEditors.push(editor);
      variants.appendChild(editor.node);
      editor.controls.name.focus();
    });
    node.append(el('h4', { text: t('tenantSettings.catalogue.variants') }), variants, el('div', { className: 'button-row' }, [addVariant]));
  }
  return { node, controls, entry, variantEditors };
}

function readVariant(editor) {
  const { controls, variant } = editor;
  return {
    id: variant.id, name: controls.name.value.trim(), description: optional(controls.description.value),
    price: { amountMinor: Number(controls.amountMinor.value), currency: controls.currency.value },
    active: controls.active.checked, order: Number(controls.order.value),
  };
}

function readEntry(editor, category) {
  const { controls, entry } = editor;
  const value = {
    id: entry.id, name: controls.name.value.trim(), description: optional(controls.description.value),
    price: { amountMinor: Number(controls.amountMinor.value), currency: controls.currency.value },
    active: controls.active.checked, order: Number(controls.order.value), siteIds: commaIds(controls.siteIds.value),
    roomIds: commaIds(controls.roomIds.value),
  };
  if (category === 'cateringPackages') {
    value.itemIds = commaIds(controls.itemIds.value);
    value.variants = editor.variantEditors.map(readVariant);
  }
  return value;
}

export function createCatalogSection({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('CATALOG_SECTION_ADAPTER_INVALID');
  let pendingDraft = null;
  let focusAfterSave = false;

  async function render({ root, isCurrent, rerender }) {
    renderSectionLoading(root, TITLE);
    let snapshot;
    let history;
    try { [snapshot, history] = await Promise.all([adapter.loadCatalogue(), adapter.listCatalogueHistory({ limit: 10 })]); }
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
    const form = el('form', { dataset: { tenantSettingsForm: 'catalogue' } });
    const editors = Object.fromEntries(CATEGORIES.map((category) => [category, []]));
    CATEGORIES.forEach((category) => {
      const surface = el('div');
      snapshot.catalogue[category].forEach((entry, index) => {
        const editor = entryEditor(entry, category, index);
        editors[category].push(editor);
        surface.appendChild(editor.node);
      });
      const add = button(t('tenantSettings.catalogue.addEntry'));
      add.addEventListener('click', () => {
        const count = editors[category].length + 1;
        const id = nextId(category, new Set(editors[category].map((entry) => entry.entry.id)));
        const base = {
          id, name: t('tenantSettings.catalogue.newEntry'), description: null,
          price: { amountMinor: 0, currency: tenantCurrency() }, active: true, order: count,
          siteIds: [], roomIds: [], ...(category === 'cateringPackages' ? { itemIds: [], variants: [] } : {}),
        };
        const editor = entryEditor(base, category, count - 1);
        editors[category].push(editor);
        surface.appendChild(editor.node);
        editor.controls.name.focus();
      });
      form.append(el('h3', { text: t(`tenantSettings.catalogue.category.${category}`) }), surface, el('div', { className: 'button-row' }, [add]));
    });
    const status = el('p', { attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
    const save = button(t('tenantSettings.action.save'), { className: 'primary', attrs: { type: 'submit' } });
    let mutationPending = false;
    form.append(el('div', { className: 'button-row' }, [save]), status);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (mutationPending) return;
      if (!form.reportValidity()) return;
      try { pendingDraft = Object.fromEntries(CATEGORIES.map((category) => [category, editors[category].map((editor) => readEntry(editor, category))])); }
      catch {
        validationSummary(form, t('tenantSettings.validation.checkFields'));
        form.querySelector('input')?.focus();
        return;
      }
      save.disabled = true;
      mutationPending = true;
      status.textContent = t('tenantSettings.status.saving');
      try {
        await adapter.saveCatalogue({ expectedRevision: snapshot.revision, catalogue: pendingDraft });
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
              const current = await adapter.loadCatalogue();
              await adapter.saveCatalogue({ expectedRevision: current.revision, catalogue: pendingDraft });
              focusAfterSave = true;
              rerender();
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
    history.revisions.forEach((entry) => historyList.appendChild(el('li', { text: t('tenantSettings.history.entry', { revision: entry.revision, date: formatDateTime(entry.effectiveAt) }) })));
    clear(root);
    root.append(
      el('section', { className: 'card' }, [
        el('h2', { text: t(TITLE), attrs: { tabindex: '-1' } }), el('p', { text: t('tenantAdmin.catalog.description') }),
        el('p', { className: 'muted', text: t('tenantAdmin.section.revision', { revision: snapshot.revision }) }), form,
      ]),
      el('section', { className: 'card' }, [el('h3', { text: t('tenantSettings.history.title') }), historyList]),
    );
    if (supportsBulkTransfer(adapter)) root.appendChild(createBulkTransferPanel({
      adapter,
      types: ['services', 'catering-items', 'catering-packages'],
      rerender,
    }));
    if (focusAfterSave) { focusAfterSave = false; requestAnimationFrame(() => root.querySelector('h2')?.focus()); }
  }

  return defineTenantAdminSection({
    id: 'catalog', titleKey: TITLE, descriptionKey: 'tenantAdmin.catalog.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.CONFIGURE, available: validAdapter(adapter), render,
  });
}

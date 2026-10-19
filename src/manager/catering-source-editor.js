import { formatNumber,t } from '../core/i18n.js';
import { button,el,field } from '../core/ui.js';

const label = (key,values) => t(`cateringSource.${key}`,values);
const ID = '[A-Za-z0-9][A-Za-z0-9._:-]{0,127}';
function amount(control,currency,aggregate = false) {
  const raw = control.value.trim(); if (!raw) return null;
  if (!/^\d{1,14}(?:[.,]\d{1,2})?$/.test(raw)) throw new TypeError('CATERING_SOURCE_AMOUNT_INVALID');
  const [whole,fraction = ''] = raw.replace(',','.').split('.');
  const minor = BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  if (minor > (aggregate ? 9007199254740990n : 1000000000n)) throw new TypeError('CATERING_SOURCE_AMOUNT_INVALID');
  return { amountMinor: Number(minor),currency: currency.value };
}
function input({ required = false,maximum = 160,pattern } = {}) {
  return el('input',{ type: 'text',attrs: { maxlength: String(maximum),...(required ? { required: 'required' } : {}),
    ...(pattern ? { pattern } : {}) } });
}
function currency() {
  return el('select',{},['EUR','CHF','GBP','USD'].map((value) => el('option',{ value,text: value })));
}
export function createCateringSourceEditor({ prefix,onSubmit,onCancel }) {
  let sequence = 0; const items = []; const packages = [];
  const form = el('form',{ dataset: { cateringSourceEditor: 'true' } }); const fields = el('fieldset');
  const error = el('p',{ attrs: { role: 'status','aria-live': 'polite' } });
  const reference = input({ required: true }); const sourceVersion = input();
  const terms = {}; const minimumAmount = input({ maximum: 17,pattern: '\\d{1,14}([.,]\\d{1,2})?' });
  minimumAmount.inputMode = 'decimal'; const minimumCurrency = currency();
  function labelled(key,control,required = false) {
    return field({ id: `${prefix}-${sequence++}`,label: label(key),control,required });
  }
  const grid = el('div',{ className: 'form-grid' },[labelled('receiptReference',reference,true),labelled('sourceVersion',sourceVersion)]);
  for (const key of ['minimumLeadTimeMinutes','changeCutoffMinutes','cancelCutoffMinutes']) {
    const control = el('input',{ type: 'number',attrs: { min: '0',max: '525600',step: '1' } }); terms[key] = control;
    grid.appendChild(labelled(`${key}Input`,control));
  }
  grid.append(labelled('minimumOrderValue',minimumAmount),labelled('currency',minimumCurrency));
  fields.append(el('legend',{ text: label('recordTitle') }),el('p',{ text: label('recordDescription') }),
    el('p',{ className: 'field-hint',text: label('blankUnknown') }),grid);
  const itemRoot = el('section',{},[el('h4',{ text: label('items') })]);
  const packageRoot = el('section',{},[el('h4',{ text: label('packages') })]);
  const addItem = button(label('addItem')); const addPackage = button(label('addPackage'));
  fields.append(itemRoot,addItem,packageRoot,addPackage);
  function limit(control,unavailable) {
    control.dataset.sourceUnavailable = String(unavailable); control.disabled = unavailable;
  }
  function refresh() {
    limit(addItem,items.length >= 300); limit(addPackage,packages.length >= 100);
    for (const group of packages) {
      const focused = document.activeElement;
      if (!group.componentRoot.contains(focused)) {
        group.componentRoot.replaceChildren(el('legend',{ text: label('chooseComponents') }));
        for (const entry of items) {
          const check = el('input',{ type: 'checkbox',checked: group.components.has(entry) });
          check.addEventListener('change',() => { if (check.checked) group.components.add(entry); else group.components.delete(entry); });
          group.componentRoot.appendChild(labelled('component',check));
          check.closest('label').querySelector('.field-label').textContent = `${entry.name.value || label('unnamed')} · ${entry.id.value}`;
        }
      }
      limit(group.addVariant,group.variants.length >= 20);
    }
  }
  function createProduct(kind,collection,parent) {
    const row = { id: input({ required: true,maximum: 128,pattern: ID }),name: input({ required: true }),
      description: el('textarea',{ attrs: { maxlength: '1000',rows: '2' } }),
      price: input({ maximum: 12,pattern: '\\d{1,8}([.,]\\d{1,2})?' }),currency: currency() };
    row.price.inputMode = 'decimal'; row.node = el('fieldset',{ className: 'card' });
    row.node.append(el('legend',{ text: label(kind,{ number: formatNumber(collection.length+1) }) }),el('div',{ className: 'form-grid' },[
      labelled('supplierId',row.id,true),labelled('productName',row.name,true),labelled('descriptionInput',row.description),
      labelled('unitCost',row.price),labelled('currency',row.currency),
    ]));
    const remove = button(label('removeProduct')); row.node.appendChild(remove);
    remove.addEventListener('click',() => {
      if (kind === 'itemEditor' && packages.some((group) => group.components.has(row))) {
        error.textContent = label('componentInUse'); row.id.focus(); return;
      }
      collection.splice(collection.indexOf(row),1); row.node.remove(); refresh();
      (kind === 'packageEditor' ? addPackage : kind === 'variantEditor' ? parent : addItem).focus();
    });
    row.id.addEventListener('blur',refresh); row.name.addEventListener('blur',refresh);
    collection.push(row); return row;
  }
  addItem.addEventListener('click',() => {
    if (items.length >= 300) return; const row = createProduct('itemEditor',items,itemRoot); itemRoot.appendChild(row.node);
    refresh(); row.id.focus();
  });
  addPackage.addEventListener('click',() => {
    if (packages.length >= 100) return;
    const row = createProduct('packageEditor',packages,packageRoot); row.components = new Set(); row.variants = [];
    row.componentRoot = el('fieldset'); row.addVariant = button(label('addVariant')); const variants = el('div');
    row.node.append(row.componentRoot,variants,row.addVariant); packageRoot.appendChild(row.node);
    row.addVariant.addEventListener('click',() => {
      if (row.variants.length >= 20) return;
      const variant = createProduct('variantEditor',row.variants,row.addVariant); variants.appendChild(variant.node);
      refresh(); variant.id.focus();
    }); refresh(); row.id.focus();
  });
  const attestation = el('input',{ type: 'checkbox',attrs: { required: 'required' } });
  const save = button(label('record'),{ type: 'submit',className: 'primary' }); const cancel = button(label('cancel'));
  cancel.addEventListener('click',onCancel);
  fields.append(labelled('attestReceived',attestation,true),el('div',{ className: 'button-row' },[save,cancel]),error);
  form.appendChild(fields);
  function product(row) {
    return { id: row.id.value,name: row.name.value,description: row.description.value.trim() || null,
      providerPrice: amount(row.price,row.currency) };
  }
  form.addEventListener('submit',async (event) => {
    event.preventDefault(); if (fields.disabled || !form.reportValidity()) return;
    error.textContent = '';
    try {
      const source = { schemaVersion: 1,sourceVersion: sourceVersion.value.trim() || null,
        items: items.map(product),packages: packages.map((row) => ({ ...product(row),
          itemIds: [...row.components].map((entry) => entry.id.value),variants: row.variants.map(product) })),
        terms: { ...Object.fromEntries(Object.entries(terms).map(([key,control]) => [key,control.value === '' ? null : Number(control.value)])),
          minimumOrderValue: amount(minimumAmount,minimumCurrency,true) } };
      await onSubmit({ reference: reference.value,attestReceivedFromSupplier: attestation.checked,source });
    } catch { error.textContent = label('invalidInput'); }
  });
  return Object.freeze({ root: form,fields,save,focus() { reference.focus(); },report(key) { error.textContent = label(key); } });
}

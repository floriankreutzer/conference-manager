import { parseCateringMoneyInput } from './catering-money-input.js';
import { formatNumber,t } from '../core/i18n.js';
import { button,el,field } from '../core/ui.js';
import { createCateringSourceProduct } from './catering-source-presentation.js';

const label = (key,values) => t(`cateringPublication.${key}`,values);
const itemKey = (kind,id) => `${kind}:${id}`;
function amountText(price) {
  return price ? formatNumber(price.amountMinor/100,{ minimumFractionDigits: 2,maximumFractionDigits: 2,useGrouping: false }) : '';
}
export function createCateringPublicationEditor({ draft,locations,defaultCurrency,createId,prefix,onSubmit,onCancel }) {
  const form = el('form',{ dataset: { cateringPublicationEditor: 'true' } }); const fields = el('fieldset');
  const reader = el('section'); const selectedRoot = el('section'); const rows = new Map(); const sourceButtons = new Map();
  const selectionTitle = el('h3',{ text: label('selection'),attrs: { tabindex: '-1' } });
  const selectedCards = el('div'); const empty = el('p',{ text: label('emptySelection') });
  const decision = el('select',{ attrs: { required: 'required' } },[
    el('option',{ value: '',text: label('chooseDecision') }),el('option',{ value: 'published',text: label('published') }),
    el('option',{ value: 'rejected',text: label('rejected') }),
  ]);
  const justification = el('textarea',{ attrs: { required: 'required',maxlength: '1000',rows: '3' } });
  const preview = el('section'); const error = el('p',{ attrs: { role: 'alert' } });
  const attest = el('input',{ type: 'checkbox',attrs: { required: 'required' } });
  const previewButton = button(label('preview')); const save = button(label('save'),{ type: 'submit',className: 'primary' });
  const cancel = button(label('cancel')); let sequence = 0; let disabled = false; let previewed = null; let proposalId = null;
  const reserved = { item: new Set(draft.existingIds('item')),package: new Set(draft.existingIds('package')) };
  function labelled(key,control,required = false) {
    return field({ id: `${prefix}-${sequence++}`,label: label(key),control,required });
  }
  function currency() {
    return el('select',{},['EUR','CHF','GBP','USD'].map((value) => el('option',{ value,text: value })));
  }
  function applicability(kind,values) {
    const select = el('select',{ attrs: { multiple: 'multiple',size: '3' } });
    for (const entry of locations[kind]) {
      const option = el('option',{ value: entry.id,text: entry.active === false
        ? t('managerSettings.choice.inactive',{ name: entry.name }) : entry.name });
      option.selected=values.includes(entry.id); select.appendChild(option);
    }
    return select;
  }
  function newEntryId(kind) {
    const value = createId(kind === 'item' ? 'cateringItems' : 'cateringPackages',[...reserved[kind]]);
    reserved[kind].add(value); return value;
  }
  function commercial({ candidates,newId,preferred = null,variant = false,onTargetChange = () => {} }) {
    const host = el('fieldset'); const target = el('select',{},[el('option',{ value: '__new',text: label('newEntry') })]);
    for (const entry of candidates) target.appendChild(el('option',{ value: entry.id,text: entry.name }));
    const price = el('input',{ type: 'text',attrs: { required: 'required',inputmode: 'decimal',maxlength: '12',
      pattern: '\\d{1,8}([.,]\\d{1,2})?' } });
    const denomination = currency(); const active = el('input',{ type: 'checkbox',checked: true });
    const order = el('input',{ type: 'number',attrs: { required: 'required',min: '0',max: '100000',step: '1' } });
    let sites; let rooms;
    host.append(el('div',{ className: 'form-grid' },[labelled('target',target,true),labelled('sellingPrice',price,true),
      labelled('currency',denomination,true),labelled('active',active),labelled('order',order,true)]),
    el('p',{ className: 'field-hint',text: label('priceHint') }));
    if (!variant) {
      sites=applicability('sites',[]); rooms=applicability('rooms',[]);
      host.append(el('div',{ className: 'form-grid' },[labelled('sites',sites),labelled('rooms',rooms)]),
        el('p',{ className: 'field-hint',text: label('scopeHint') }));
    }
    function selection() { return candidates.find((x) => x.id === target.value) ?? null; }
    function update() {
      const chosen = selection(); price.value=amountText(chosen?.price); denomination.value=chosen?.price?.currency ?? defaultCurrency;
      active.checked=chosen?.active ?? true; order.value=String(chosen?.order ?? 0);
      if (!variant) {
        for (const option of sites.options) option.selected=(chosen?.siteIds ?? []).includes(option.value);
        for (const option of rooms.options) option.selected=(chosen?.roomIds ?? []).includes(option.value);
      }
      onTargetChange(chosen,target.value === '__new' ? newId : chosen.id);
    }
    target.value=preferred && candidates.some((x) => x.id === preferred) ? preferred : '__new';
    target.addEventListener('change',update); update();
    return { host,price,target,entry: selection,entryId: () => target.value === '__new' ? newId : selection().id,
      read() {
        return { entryId: target.value === '__new' ? newId : selection().id,price: parseCateringMoneyInput(price.value,denomination.value),
          active: active.checked,order: Number(order.value),...(variant ? {} : {
            siteIds: [...sites.selectedOptions].map((x) => x.value),roomIds: [...rooms.selectedOptions].map((x) => x.value),
          }) };
      } };
  }
  function refresh() {
    fields.disabled=disabled; reader.querySelectorAll('button').forEach((control) => {
      control.disabled=disabled || rows.has(control.dataset.sourceKey);
    });
    for (const row of rows.values()) {
      row.commercial.host.disabled=decision.value !== 'published';
      for (const variant of row.variants) {
        variant.check.disabled=decision.value !== 'published'; variant.edit.host.disabled=!variant.check.checked;
      }
    }
    empty.hidden=rows.size>0; previewButton.disabled=disabled; save.disabled=disabled;
    attest.disabled=disabled || previewed === null;
  }
  function clearPreview(event) {
    if (event?.target === attest) return;
    previewed=null; proposalId=null; attest.checked=false; attest.disabled=true; preview.replaceChildren();
  }
  function add(kind,source) {
    const identifier = itemKey(kind,source.id); if (rows.has(identifier)) return;
    clearPreview(); const product = draft.remember(kind,source); const previous = draft.previousTarget(kind,product.id);
    const row = { product,kind,variants: [],node: el('fieldset',{ className: 'card',
      dataset: { reviewSourceKind: kind,reviewSourceId: product.id } }) };
    row.node.append(el('legend',{ text: product.name }),createCateringSourceProduct(product));
    const variantsHost = el('section');
    row.commercial=commercial({ candidates: draft.candidates(kind),newId: newEntryId(kind),preferred: previous?.entryId,
      onTargetChange(chosen,parentId) {
        if (kind !== 'package') return;
        variantsHost.replaceChildren(); row.variants=[];
        const existing = chosen?.variants ?? []; const allocated = [...existing];
        for (const variant of product.variants) {
          const check = el('input',{ type: 'checkbox' }); const node = el('fieldset');
          const old = previous?.entryId === parentId ? previous.variants.find((x) => x.sourceId === variant.id) : null;
          let generated=null;
          if (existing.length<20) {
            try { generated=createId(`${parentId}-variant`,allocated.map((x) => x.id)); }
            catch (failure) {
              if (!(failure instanceof RangeError)) throw failure;
              generated=createId('variant',allocated.map((x) => x.id));
            }
            allocated.push({ id: generated });
          }
          const edit = commercial({ candidates: existing,newId: generated,preferred: old?.entryId,variant: true });
          if (generated === null) {
            edit.target.querySelector('option[value="__new"]').disabled=true;
            edit.target.value=old?.entryId ?? existing[0]?.id ?? '__new'; edit.target.dispatchEvent(new Event('change'));
          }
          node.append(labelled('variant',check),edit.host);
          node.querySelector('.field-label').textContent=label('variant',{ name: variant.name });
          check.addEventListener('change',refresh); variantsHost.appendChild(node); row.variants.push({ product: variant,check,edit });
        }
      } });
    row.node.append(row.commercial.host,variantsHost);
    const remove = button(label('remove')); row.node.appendChild(remove);
    remove.addEventListener('click',() => {
      rows.delete(identifier); row.node.remove(); clearPreview(); refresh();
      const sourceButton = sourceButtons.get(identifier); (sourceButton?.isConnected ? sourceButton : selectionTitle).focus();
    });
    rows.set(identifier,row); selectedCards.appendChild(row.node); refresh(); row.commercial.price.focus();
  }
  function value() {
    const items = []; const packages = [];
    if (decision.value === 'published') for (const row of rows.values()) {
      const entry = { sourceId: row.product.id,...row.commercial.read() };
      if (row.kind === 'item') items.push(entry);
      else packages.push({ ...entry,variants: row.variants.filter((x) => x.check.checked)
        .map((x) => ({ sourceId: x.product.id,...x.edit.read() })) });
    }
    return { commandId: proposalId,decision: decision.value,justification: justification.value,items,packages };
  }
  function report(failure) {
    const messages = { CATERING_CATALOGUE_REVIEW_CAPACITY: 'tooLarge',CATERING_CATALOGUE_REVIEW_COMPONENT_UNREVIEWED: 'componentsMissing',
      CATERING_CATALOGUE_REVIEW_OWNER_CONFLICT: 'ownerConflict',CATERING_CATALOGUE_REVIEW_SOURCE_UNREVIEWED: 'sourceChanged',
      CATERING_CATALOGUE_REVIEW_VARIANT_LIMIT: 'variantLimit' };
    error.textContent=label(messages[failure?.message] ?? 'invalidInput');
  }
  previewButton.addEventListener('click',() => {
    error.textContent=''; if (disabled || !form.reportValidity()) return;
    try {
      proposalId=globalThis.crypto.randomUUID(); const intent=value(); const command=draft.command(intent);
      const omitted=draft.retiring(intent); previewed=JSON.stringify(command); attest.checked=false;
      const heading = el('h3',{ text: label('effects'),attrs: { tabindex: '-1' } });
      preview.replaceChildren(heading,el('p',{ text: decision.value === 'rejected'
        ? label('rejectionEffect') : label('counts',{ items: formatNumber(command.items.length),packages: formatNumber(command.packages.length) }) }));
      if (decision.value === 'published') preview.append(el('p',{ text: label('retiring',{ count: formatNumber(omitted.length) }) }),
        el('ul',{},omitted.map((entry) => el('li',{ text: entry.name }))));
      refresh(); heading.focus();
    } catch (failure) { clearPreview(); report(failure); }
  });
  form.addEventListener('input',clearPreview); decision.addEventListener('change',() => { clearPreview(); refresh(); });
  form.addEventListener('submit',async (event) => {
    event.preventDefault(); if (disabled || !form.reportValidity()) return;
    try {
      if (!attest.checked || !previewed) { error.textContent=label('previewRequired'); return; }
      const intent=value(); const command=draft.command(intent);
      if (JSON.stringify(command) !== previewed) { error.textContent=label('previewRequired'); return; }
      await onSubmit(command);
    } catch (failure) { report(failure); }
  });
  cancel.addEventListener('click',onCancel);
  selectedRoot.append(selectionTitle,empty,selectedCards);
  fields.append(labelled('decision',decision,true),reader,selectedRoot,labelled('justification',justification,true),
    el('div',{ className: 'button-row' },[previewButton]),preview,labelled('attest',attest,true),
    el('div',{ className: 'button-row' },[save,cancel]),error);
  form.appendChild(fields); refresh();
  return Object.freeze({ root: form,fields,save,
    showPage(kind,entries) {
      reader.replaceChildren(); sourceButtons.clear();
      for (const source of entries) {
        const choose = button(label(rows.has(itemKey(kind,source.id)) ? 'alreadySelected' : 'add'),
          { dataset: { sourceKey: itemKey(kind,source.id) } });
        choose.addEventListener('click',() => add(kind,source)); sourceButtons.set(itemKey(kind,source.id),choose);
        reader.append(createCateringSourceProduct(source),choose);
      }
      if (!entries.length) reader.appendChild(el('p',{ text: label('emptyPage') })); refresh();
    },
    setDisabled(value) { disabled=value; refresh(); },
    report(key) { error.textContent=label(key); },focus() { decision.focus(); },
  });
}

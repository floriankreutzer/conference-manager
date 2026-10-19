import { formatMoney,formatNumber,t } from '../core/i18n.js';
import { el } from '../core/ui.js';

const label = (suffix,values) => t(`cateringSource.${suffix}`,values);

export function createCateringSourceTerms(value) {
  const list = el('dl');
  for (const name of ['minimumLeadTimeMinutes','minimumOrderValue','changeCutoffMinutes','cancelCutoffMinutes']) {
    const fact = value[name]; const formatted = fact === null ? label('unknown')
      : name === 'minimumOrderValue' ? formatMoney(fact.amountMinor/100,fact.currency) : label('minutes',{ number: formatNumber(fact) });
    list.append(el('dt',{ text: label(name) }),el('dd',{ text: formatted }));
  }
  return list;
}
export function createCateringSourceProduct(entry) {
  const price = entry.providerPrice === null ? label('unknown') : formatMoney(entry.providerPrice.amountMinor/100,entry.providerPrice.currency);
  const card = el('section',{ className: 'card' },[
    el('h4',{ text: entry.name }),el('p',{ text: label('article',{ reference: entry.id }) }),
    el('p',{ text: label('supplierPrice',{ price }) }),
  ]);
  if (entry.description !== null) card.appendChild(el('p',{ text: entry.description }));
  if (entry.itemIds) card.appendChild(el('p',{ text: label('components',{ references: entry.itemIds.join(', ') }) }));
  if (entry.variants?.length) card.appendChild(el('ul',{},entry.variants.map((variant) => el('li',{
    text: label('variant',{ name: variant.name,reference: variant.id,price: variant.providerPrice === null ? label('unknown')
      : formatMoney(variant.providerPrice.amountMinor/100,variant.providerPrice.currency) }),
  }))));
  return card;
}

import { formatNumber, locale, t } from '../core/i18n.js';
import { el, field } from '../core/ui.js';

// The original select remains the sole value owner; filtering never removes options.
export function namedSelectionField({ id, label, control, ...options }) {
  const search = el('input', { type: 'search' });
  const selected = el('ul', { className: 'named-selection-values', attrs: {
    'aria-label': t('managerSettings.choice.selectedFor', { field: label }),
  } });
  const count = el('p', { attrs: { role: 'status', 'aria-live': 'polite' } });
  function refresh() {
    const query = search.value.trim().toLocaleLowerCase(locale());
    const values = Array.from(control.selectedOptions);
    for (const option of control.options) {
      option.hidden = !option.selected && !option.textContent.toLocaleLowerCase(locale()).includes(query);
    }
    selected.replaceChildren(...values.map((option) => el('li', { text: option.textContent })));
    count.textContent = t('managerSettings.choice.selectedCount', { count: formatNumber(values.length) });
  }
  search.addEventListener('input', refresh);
  control.addEventListener('change', refresh);
  refresh();
  return el('div', { className: 'named-selection-field' }, [
    field({ id, label, control, ...options }),
    field({ id: `${id}-search`, label: t('managerSettings.choice.searchFor', { field: label }), control: search }),
    count, selected,
  ]);
}

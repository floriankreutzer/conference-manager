import { formatNumber, locale, t } from '../core/i18n.js';
import { button, el, field } from '../core/ui.js';

// Presentation only: all editor controls stay mounted for complete snapshot saves.
export function createCatalogueEditorList({ id, editors = [], nameOf = (editor) => editor.controls.name.value }) {
  const search = el('input', { attrs: { type: 'search' } });
  const reset = button(t('manager.ux.resetFilters'));
  const count = el('p', { attrs: { role: 'status', 'aria-live': 'polite' } });
  const rows = el('div', { className: 'catalogue-editor-rows' });
  const entries = [];
  let revealingInvalid = false;
  const node = el('section', { className: 'catalogue-editor-list' }, [
    el('div', { className: 'toolbar' }, [
      field({ id: `${id}-search`, label: t('managerSettings.catalogue.search'), control: search }), reset,
    ]), count, rows,
  ]);
  function open(selected) {
    entries.forEach((entry) => { entry.details.open = entry === selected; });
  }
  function filter() {
    const query = search.value.trim().toLocaleLowerCase(locale());
    let shown = 0;
    entries.forEach((entry) => {
      entry.details.hidden = !nameOf(entry.editor).toLocaleLowerCase(locale()).includes(query);
      if (!entry.details.hidden) shown += 1;
    });
    count.textContent = t('managerSettings.catalogue.searchCount', {
      shown: formatNumber(shown), total: formatNumber(entries.length),
    });
  }
  function add(editor, { expanded = false } = {}) {
    const summary = el('summary', { text: nameOf(editor) });
    const details = el('details', { className: 'catalogue-editor-row' }, [summary, editor.node]);
    const entry = { editor, details };
    entries.push(entry);
    rows.appendChild(details);
    editor.node.addEventListener('input', () => { summary.textContent = nameOf(editor); });
    summary.addEventListener('click', () => { revealingInvalid = false; });
    details.addEventListener('toggle', () => {
      if (details.open && details.isConnected && !revealingInvalid) open(entry);
    });
    if (expanded) { search.value = ''; revealingInvalid = false; open(entry); }
    filter();
    return details;
  }
  search.addEventListener('input', filter);
  reset.addEventListener('click', () => { search.value = ''; filter(); search.focus(); });
  node.addEventListener('invalid', (event) => {
    const entry = entries.find(({ editor }) => editor.node.contains(event.target));
    if (!entry) return;
    search.value = '';
    filter();
    revealingInvalid = true;
    entry.details.open = true;
  }, true);
  editors.forEach((editor, index) => add(editor, { expanded: index === 0 }));
  return Object.freeze({ node, add });
}

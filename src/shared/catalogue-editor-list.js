import { formatNumber, locale, t } from '../core/i18n.js';
import { button, el, field } from '../core/ui.js';

// Presentation only: all editor controls stay mounted for complete snapshot saves.
export function createCatalogueEditorList({ id, editors = [],
  nameOf = (editor) => editor.controls.name.value, activeOf = null, summaryOf = null }) {
  const search = el('input', { attrs: { type: 'search' }, dataset: { editorPresentation: 'true' } });
  const status = typeof activeOf === 'function'
    ? el('select', { dataset: { editorPresentation: 'true' } }, [
      el('option', { value: 'all', text: t('managerSettings.catalogue.statusAll') }),
      el('option', { value: 'active', text: t('managerSettings.catalogue.statusActive') }),
      el('option', { value: 'inactive', text: t('managerSettings.catalogue.statusInactive') }),
    ]) : null;
  const reset = button(t('manager.ux.resetFilters'));
  const count = el('p', { attrs: { role: 'status', 'aria-live': 'polite' } });
  const rows = el('div', { className: 'catalogue-editor-rows' });
  const entries = [];
  let revealingInvalid = false;
  const node = el('section', { className: 'catalogue-editor-list' }, [
    el('div', { className: 'toolbar' }, [
      field({ id: `${id}-search`, label: t('managerSettings.catalogue.search'), control: search }),
      ...(status ? [field({ id: `${id}-status`, label: t('managerSettings.catalogue.statusFilter'), control: status })] : []), reset,
    ]), count, rows,
  ]);
  function open(selected) {
    entries.forEach((entry) => { entry.details.open = entry === selected; });
  }
  function resetFilters() {
    search.value = '';
    if (status) status.value = 'all';
  }
  function filter() {
    const query = search.value.trim().toLocaleLowerCase(locale());
    let shown = 0;
    entries.forEach((entry) => {
      const activityMatches = !status || status.value === 'all'
        || (status.value === 'active' && activeOf(entry.editor) === true)
        || (status.value === 'inactive' && activeOf(entry.editor) === false);
      entry.details.hidden = !activityMatches || !nameOf(entry.editor).toLocaleLowerCase(locale()).includes(query);
      if (!entry.details.hidden) shown += 1;
    });
    count.textContent = t('managerSettings.catalogue.searchCount', {
      shown: formatNumber(shown), total: formatNumber(entries.length),
    });
  }
  function add(editor, { expanded = false } = {}) {
    const name = el('span', { className: 'catalogue-editor-name', text: nameOf(editor) });
    const summary = el('summary', {}, [name]);
    const metadata = typeof summaryOf === 'function'
      ? el('span', { className: 'catalogue-editor-summary' }) : null;
    if (metadata) summary.appendChild(metadata);
    const updateSummary = () => {
      name.textContent = nameOf(editor);
      if (metadata) metadata.replaceChildren(...summaryOf(editor).map((text) => el('span', { text })));
    };
    updateSummary();
    const details = el('details', { className: 'catalogue-editor-row' }, [summary, editor.node]);
    const entry = { editor, details };
    entries.push(entry);
    rows.appendChild(details);
    // Update visible draft facts without hiding the field being edited. Filters
    // are reapplied by their own controls, reset, add and validation reveal.
    editor.node.addEventListener('input', updateSummary);
    editor.node.addEventListener('change', updateSummary);
    summary.addEventListener('click', () => { revealingInvalid = false; });
    details.addEventListener('toggle', () => {
      if (details.open && details.isConnected && !revealingInvalid) open(entry);
    });
    if (expanded) { resetFilters(); revealingInvalid = false; open(entry); }
    filter();
    return details;
  }
  search.addEventListener('input', filter);
  status?.addEventListener('change', filter);
  reset.addEventListener('click', () => { resetFilters(); filter(); search.focus(); });
  function reveal(control, { exclusive = false } = {}) {
    const entry = entries.find(({ editor }) => editor.node.contains(control));
    if (!entry) return;
    resetFilters();
    filter();
    revealingInvalid = !exclusive;
    if (exclusive) open(entry);
    else entry.details.open = true;
  }
  node.addEventListener('invalid', (event) => reveal(event.target), true);
  editors.forEach((editor, index) => add(editor, { expanded: index === 0 }));
  return Object.freeze({ node, add, reveal });
}

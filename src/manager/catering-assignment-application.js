import { formatNumber, t } from '../core/i18n.js';
import { button, el, field } from '../core/ui.js';
import { authorityFailureCode } from '../shared/authority-failure.js';
import { createCateringAssignmentDraft } from './catering-assignment-draft.js';

export async function renderCateringAssignments({ root, catalogue, adapter, isCurrent, onAuthorityFailure }) {
  const status = el('p', { text: t('managerSettings.loading'), attrs: { role: 'status', 'aria-live': 'polite' } });
  root.appendChild(status);
  let snapshot;
  let source;
  let page;
  let draft;
  let busy = false;
  let conflict = false;
  const surface = el('div');
  const form = el('form');
  const choices = el('div', { className: 'form-grid' });
  const save = button(t('managerSettings.save'), { type: 'submit', className: 'primary' });
  const first = button(t('managerSettings.assignment.first'));
  const next = button(t('managerSettings.assignment.next'));
  const reload = button(t('managerSettings.assignment.reload'));
  const navigation = el('div', { className: 'button-row' }, [first, next, reload]);
  form.append(choices, navigation, save);
  surface.appendChild(form);

  function setBusy(value) {
    busy = value;
    form.setAttribute('aria-busy', String(value));
    for (const control of form.querySelectorAll('button, select')) control.disabled = value;
    next.disabled = value || !page?.nextAfterIntegrationId;
    first.disabled = value || !draft;
    save.disabled = value || conflict || !draft;
  }
  function report(error) {
    if (authorityFailureCode(error)) { onAuthorityFailure(error); return; }
    if (!isCurrent()) return;
    conflict = error?.code === 'HTTP_409'
      || ['CATERING_ASSIGNMENT_REVISION_CONFLICT', 'TENANT_SETTINGS_REVISION_CONFLICT'].includes(error?.serverCode)
      || ['CATERING_ASSIGNMENT_REVISION_CONFLICT', 'TENANT_SETTINGS_REVISION_CONFLICT'].includes(error?.code);
    status.textContent = t(conflict ? 'managerSettings.conflict' : 'managerSettings.assignment.error');
    setBusy(false);
  }
  function renderChoices() {
    choices.replaceChildren();
    for (const [index, group] of draft.groups.entries()) {
      const select = el('select', { attrs: { required: 'required' } });
      select.appendChild(el('option', { value: '', text: t('managerSettings.assignment.choose') }));
      const selected = draft.selection(group.groupId);
      const options = page.connections.map((entry) => entry.integrationId);
      if (selected && !options.includes(selected)) options.unshift(selected);
      for (const integrationId of options) select.appendChild(el('option', {
        value: integrationId, text: t('managerSettings.assignment.connection', {
          reference: `${integrationId.slice(0, 8)}…${integrationId.slice(-8)}`,
        }),
      }));
      select.value = selected;
      select.addEventListener('change', () => draft.select(group.groupId, select.value));
      const legendId = `catering-assignment-group-${index}`;
      const members = el('ul', {}, group.entries.map((entry) => el('li', {
        text: t(entry.kind === 'package' ? 'managerSettings.assignment.package' : 'managerSettings.assignment.item', {
          name: entry.active ? entry.name : t('managerSettings.choice.inactive', { name: entry.name }),
        }),
      })));
      choices.appendChild(el('fieldset', { className: 'card' }, [
        el('legend', { id: legendId, text: t('managerSettings.assignment.group', { number: formatNumber(index + 1) }) }),
        members,
        field({ id: `catering-assignment-choice-${index}`, label: t('managerSettings.assignment.supplier'), control: select, required: true }),
      ]));
    }
    if (!draft.groups.length) choices.appendChild(el('p', { text: t('managerSettings.assignment.empty') }));
    setBusy(false);
  }
  async function load({ focus = false } = {}) {
    if (busy || !isCurrent()) return;
    setBusy(true);
    try {
      const [loaded, canonical, connections] = await Promise.all([
        adapter.loadAssignments(), catalogue.loadCatalogue(), adapter.listConnections(),
      ]);
      if (!isCurrent()) return;
      if (loaded.currentCatalogueRevision !== canonical.revision) throw new Error('CATERING_ASSIGNMENT_SNAPSHOT_CHANGED');
      snapshot = loaded; source = canonical; page = connections;
      draft = createCateringAssignmentDraft({ catalogue: source.catalogue, current: snapshot });
      conflict = false;
      status.textContent = t(snapshot.stale ? 'managerSettings.assignment.stale' : 'managerSettings.assignment.revision', {
        revision: formatNumber(snapshot.revision), catalogueRevision: formatNumber(source.revision),
      });
      renderChoices();
      if (!surface.isConnected) root.appendChild(surface);
      if (focus) reload.focus();
    } catch (error) { report(error); }
  }
  async function loadPage(afterIntegrationId) {
    if (busy || !isCurrent()) return;
    setBusy(true);
    try {
      const loaded = await adapter.listConnections({ afterIntegrationId });
      if (!isCurrent()) return;
      page = loaded;
      renderChoices();
      first.focus();
      status.textContent = t('managerSettings.assignment.pageLoaded');
    } catch (error) { report(error); }
  }
  first.addEventListener('click', () => { void loadPage(null); });
  next.addEventListener('click', () => { if (page?.nextAfterIntegrationId) void loadPage(page.nextAfterIntegrationId); });
  reload.addEventListener('click', () => { void load({ focus: true }); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || conflict || !isCurrent() || !form.reportValidity()) return;
    setBusy(true);
    try {
      const saved = await adapter.saveAssignments({ expectedRevision: snapshot.revision,
        catalogueRevision: source.revision, assignments: draft.assignments() });
      if (!isCurrent()) return;
      snapshot = saved;
      status.textContent = t('managerSettings.assignment.saved', { revision: formatNumber(saved.revision) });
      setBusy(false);
      save.focus();
    } catch (error) { report(error); }
  });
  // Keep explicit recovery available even when the first projection cannot load.
  root.appendChild(surface);
  await load();
}

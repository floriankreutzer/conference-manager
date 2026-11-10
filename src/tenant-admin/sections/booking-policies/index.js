import { createPolicyReferenceEditor } from './reference-editor.js';
import { createPolicyDurationEditor } from './duration-editor.js';
import { formatDateTime, t } from '../../../core/i18n.js';
import { announce, button, clear, el, field, showToast, validationSummary } from '../../../core/ui.js';
import { TENANT_ADMIN_SECTION_PERMISSION, defineTenantAdminSection } from '../../section-contract.js';
import { renderSectionConflict, renderSectionError, renderSectionLoading } from '../../section-presentation.js';
import { tenantSettingsConflictRevision } from '../../settings-revision.js';

const TITLE = 'tenantAdmin.bookingPolicies.title';

function validAdapter(adapter) {
  return adapter !== null && ['loadBookingPolicies', 'saveBookingPolicies', 'listBookingPoliciesHistory', 'loadBookingPoliciesRevision']
    .every((method) => typeof adapter?.[method] === 'function');
}

const integerInput = (value, maximum, minimum = 0) => el('input', {
  type: 'number', value, attrs: { min: String(minimum), max: String(maximum), step: '1', required: 'required' },
});
const localDateTime = (instant) => {
  const date = new Date(instant);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
};
const nextId = (existing) => {
  let index = existing.size + 1;
  while (existing.has(`policy-${index}`)) index += 1;
  return `policy-${index}`;
};

function versionEditor(version, index, catalog) {
  const immutable = new Date(version.effectiveFrom).getTime() <= Date.now();
  const controls = {
    effectiveFrom: el('input', { type: 'datetime-local', value: localDateTime(version.effectiveFrom), disabled: immutable, attrs: { required: 'required' } }),
    maximumParticipants: integerInput(version.rules.maximumParticipants, 100_000, 1),
  };
  if (immutable) Object.values(controls).forEach((control) => { control.disabled = true; });
  const prefix = `tenant-policy-${index}`;
  const durations = {
    minimumLeadTimeMinutes: createPolicyDurationEditor({ id: `${prefix}-lead`, label: t('tenantSettings.bookingPolicies.minimumLeadTime'),
      minutes: version.rules.minimumLeadTimeMinutes, minimum: 0, maximum: 43200, disabled: immutable }),
    maximumAdvanceMinutes: createPolicyDurationEditor({ id: `${prefix}-advance`, label: t('tenantSettings.bookingPolicies.maximumAdvance'),
      minutes: version.rules.maximumAdvanceMinutes, minimum: 1, maximum: 1054080, disabled: immutable }),
    cancellationWindowMinutes: createPolicyDurationEditor({ id: `${prefix}-cancel`, label: t('tenantSettings.bookingPolicies.cancellationWindow'),
      minutes: version.rules.cancellationWindowMinutes, minimum: 0, maximum: 43200, disabled: immutable }),
    changeWindowMinutes: createPolicyDurationEditor({ id: `${prefix}-change`, label: t('tenantSettings.bookingPolicies.changeWindow'),
      minutes: version.rules.changeWindowMinutes, minimum: 0, maximum: 43200, disabled: immutable }),
  };
  const references = Object.fromEntries([['allowedSiteIds', 'sites'], ['allowedRoomIds', 'rooms'], ['allowedServiceIds', 'services']]
    .map(([key, collection]) => [key, createPolicyReferenceEditor({
      label: t(`tenantSettings.bookingPolicies.${key}`), savedIds: version.rules[key],
      options: catalog?.[collection] ?? null, disabled: immutable,
    })]));
  const node = el('fieldset', { className: 'card', dataset: { bookingPolicyId: version.id } }, [
    el('legend', { text: t('tenantSettings.bookingPolicies.version', { date: formatDateTime(version.effectiveFrom) }) }),
    el('p', { className: 'muted', text: immutable ? t('tenantSettings.bookingPolicies.immutable') : t('tenantSettings.bookingPolicies.scheduled') }),
    el('div', { className: 'form-grid' }, [
      field({ id: `${prefix}-effective`, label: t('tenantSettings.bookingPolicies.effectiveFrom'), control: controls.effectiveFrom, required: true }),
      durations.minimumLeadTimeMinutes.node,
      durations.maximumAdvanceMinutes.node,
      durations.cancellationWindowMinutes.node,
      durations.changeWindowMinutes.node,
      field({ id: `${prefix}-participants`, label: t('tenantSettings.bookingPolicies.maximumParticipants'), control: controls.maximumParticipants, required: true }),
      references.allowedSiteIds.node,
      references.allowedRoomIds.node,
      references.allowedServiceIds.node,
    ]),
  ]);
  return { node, controls, durations, references, version, immutable };
}

function readVersion(editor) {
  if (editor.immutable) return structuredClone(editor.version);
  const { controls, version } = editor;
  const effectiveFrom = new Date(controls.effectiveFrom.value).toISOString();
  if (new Date(effectiveFrom).getTime() <= Date.now()) throw new TypeError('BOOKING_POLICY_RETROACTIVE_INVALID');
  const rules = {
    minimumLeadTimeMinutes: editor.durations.minimumLeadTimeMinutes.read(),
    maximumAdvanceMinutes: editor.durations.maximumAdvanceMinutes.read(),
    cancellationWindowMinutes: editor.durations.cancellationWindowMinutes.read(),
    changeWindowMinutes: editor.durations.changeWindowMinutes.read(),
    maximumParticipants: Number(controls.maximumParticipants.value),
    allowedSiteIds: editor.references.allowedSiteIds.read(), allowedRoomIds: editor.references.allowedRoomIds.read(),
    allowedServiceIds: editor.references.allowedServiceIds.read(),
  };
  if ([rules.minimumLeadTimeMinutes, rules.cancellationWindowMinutes, rules.changeWindowMinutes]
    .some((value) => value > rules.maximumAdvanceMinutes)) throw new TypeError('BOOKING_POLICY_WINDOW_INVALID');
  return { id: version.id, effectiveFrom, rules };
}

export function createBookingPoliciesSection({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('BOOKING_POLICIES_SECTION_ADAPTER_INVALID');
  let focusAfterSave = false;

  async function render({ root, isCurrent, rerender, registerEditor }) {
    renderSectionLoading(root, TITLE);
    let snapshot;
    let history;
    let referenceCatalog = null;
    try { [snapshot, history, referenceCatalog] = await Promise.all([
      adapter.loadBookingPolicies(), adapter.listBookingPoliciesHistory({ limit: 20 }),
      adapter.loadReferenceCatalog?.().catch(() => null) ?? null,
    ]); }
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
    const form = el('form', { dataset: { tenantSettingsForm: 'booking-policies' } });
    const editors = snapshot.configuration.versions.map((version, index) => versionEditor(version, index, referenceCatalog));
    const versionsSurface = el('div', { className: 'policy-version-list' }, editors.map((entry) => entry.node));
    const add = button(t('tenantSettings.bookingPolicies.addVersion'));
    add.addEventListener('click', () => {
      const count = editors.length + 1;
      const future = new Date(Date.now() + 86_400_000);
      future.setUTCHours(0, 0, 0, 0);
      const source = snapshot.configuration.versions.at(-1);
      const id = nextId(new Set(editors.map((entry) => entry.version.id)));
      const editor = versionEditor({ id, effectiveFrom: future.toISOString(), rules: structuredClone(source.rules) }, count - 1, referenceCatalog);
      editors.push(editor);
      versionsSurface.appendChild(editor.node);
      editor.controls.effectiveFrom.focus();
    });
    form.append(versionsSurface, el('div', { className: 'button-row' }, [add]));
    const status = el('p', { attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
    const save = button(t('tenantSettings.action.save'), { className: 'primary', attrs: { type: 'submit' } });
    let mutationPending = false;
    form.append(el('div', { className: 'button-row' }, [save]), status);
    const editorState = registerEditor?.({
      read: () => JSON.stringify([...form.querySelectorAll('input, select')].map((control) =>
        [control.id, control.type === 'checkbox' ? control.checked : control.value])), isCurrent,
    });
    const dirtyStatus = () => { if (!mutationPending) status.textContent = editorState?.isDirty() ? t('tenantAdmin.unsaved.title') : ''; };
    form.addEventListener('input', dirtyStatus);
    form.addEventListener('change', dirtyStatus);
    add.addEventListener('click', dirtyStatus);
    const conflict = el('div');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (mutationPending) return;
      if (!form.reportValidity()) return;
      let submittedDraft;
      try {
        const versions = editors.map(readVersion).sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
        if (new Set(versions.map((entry) => entry.effectiveFrom)).size !== versions.length) throw new TypeError('BOOKING_POLICY_EFFECTIVE_DUPLICATE');
        submittedDraft = { versions };
      } catch {
        validationSummary(form, t('tenantSettings.validation.checkFields'));
        form.querySelector('input:not([disabled])')?.focus();
        return;
      }
      save.disabled = true;
      mutationPending = true;
      const locked = [...form.querySelectorAll('input:not(:disabled), select:not(:disabled), button:not(:disabled)')];
      locked.forEach((control) => { control.disabled = true; });
      status.textContent = t('tenantSettings.status.saving');
      try {
        await adapter.saveBookingPolicies({ expectedRevision: snapshot.revision, configuration: submittedDraft });
        if (!isCurrent()) return;
        editorState?.saved();
        focusAfterSave = true;
        showToast(t('tenantSettings.status.saved'));
        announce(t('tenantSettings.status.saved'));
        rerender();
      } catch (error) {
        if (!isCurrent()) return;
        const currentRevision = tenantSettingsConflictRevision(error);
        if (currentRevision !== null) {
          status.textContent = t('tenantSettings.status.saveFailed');
          renderSectionConflict(conflict, TITLE, { currentRevision, onReload: rerender });
          conflict.querySelector('h2')?.focus();
          return;
        }
        save.disabled = false;
        mutationPending = false;
        status.textContent = t('tenantSettings.status.saveFailed');
        announce(status.textContent, { assertive: true });
        save.focus();
      } finally {
        if (isCurrent()) {
          locked.forEach((control) => { control.disabled = false; });
          save.disabled = false;
          mutationPending = false;
        }
      }
    });
    const historyList = el('ol');
    history.forEach((entry) => historyList.appendChild(el('li', { text: t('tenantSettings.history.entry', { revision: entry.revision, date: formatDateTime(entry.changedAt) }) })));
    clear(root);
    const workspace = el('div', { className: 'tenant-policy-workspace' });
    workspace.append(
      el('section', { className: 'card' }, [
        el('h2', { text: t(TITLE), attrs: { tabindex: '-1' } }), el('p', { text: t('tenantAdmin.bookingPolicies.description') }),
        el('p', { className: 'muted', text: t('tenantAdmin.section.revision', { revision: snapshot.revision }) }), conflict, form,
      ]),
      el('section', { className: 'card' }, [el('h3', { text: t('tenantSettings.history.title') }), historyList]),
    );
    root.appendChild(workspace);
    if (focusAfterSave) {
      requestAnimationFrame(() => {
        if (!focusAfterSave || !isCurrent()) return;
        const heading = root.querySelector('h2');
        if (!heading?.isConnected) return;
        focusAfterSave = false;
        // Save focus must not interrupt interaction that began before this frame.
        if (root.contains(document.activeElement)) return;
        heading.focus();
      });
    }
  }

  return defineTenantAdminSection({
    id: 'booking-policies', titleKey: TITLE, descriptionKey: 'tenantAdmin.bookingPolicies.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.CONFIGURE, available: validAdapter(adapter), render,
  });
}

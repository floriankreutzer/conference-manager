import { formatDateTime, t } from '../../../core/i18n.js';
import { announce, button, clear, el, field, showToast, validationSummary } from '../../../core/ui.js';
import { TENANT_ADMIN_SECTION_PERMISSION, defineTenantAdminSection } from '../../section-contract.js';
import { renderSectionConflict, renderSectionError, renderSectionLoading } from '../../section-presentation.js';
import { tenantSettingsConflictRevision } from '../../settings-revision.js';

export { createDemoBookingPolicySettings } from './demo-adapter.js';

const TITLE = 'tenantAdmin.bookingPolicies.title';
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function validAdapter(adapter) {
  return adapter !== null && ['loadBookingPolicies', 'saveBookingPolicies', 'listBookingPoliciesHistory', 'loadBookingPoliciesRevision']
    .every((method) => typeof adapter?.[method] === 'function');
}

const integerInput = (value, maximum, minimum = 0) => el('input', {
  type: 'number', value, attrs: { min: String(minimum), max: String(maximum), step: '1', required: 'required' },
});
const ids = (value) => {
  const entries = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (new Set(entries).size !== entries.length || entries.some((entry) => !SAFE_ID.test(entry))) throw new TypeError('BOOKING_POLICY_IDS_INVALID');
  return entries;
};
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

function versionEditor(version, index) {
  const immutable = new Date(version.effectiveFrom).getTime() <= Date.now();
  const controls = {
    effectiveFrom: el('input', { type: 'datetime-local', value: localDateTime(version.effectiveFrom), disabled: immutable, attrs: { required: 'required' } }),
    minimumLeadTimeMinutes: integerInput(version.rules.minimumLeadTimeMinutes, 43_200),
    maximumAdvanceMinutes: integerInput(version.rules.maximumAdvanceMinutes, 1_054_080, 1),
    cancellationWindowMinutes: integerInput(version.rules.cancellationWindowMinutes, 43_200),
    changeWindowMinutes: integerInput(version.rules.changeWindowMinutes, 43_200),
    maximumParticipants: integerInput(version.rules.maximumParticipants, 100_000, 1),
    allowedSiteIds: el('input', { type: 'text', value: version.rules.allowedSiteIds.join(', '), attrs: { maxlength: '4000' } }),
    allowedRoomIds: el('input', { type: 'text', value: version.rules.allowedRoomIds.join(', '), attrs: { maxlength: '4000' } }),
    allowedServiceIds: el('input', { type: 'text', value: version.rules.allowedServiceIds.join(', '), attrs: { maxlength: '4000' } }),
  };
  if (immutable) Object.values(controls).forEach((control) => { control.disabled = true; });
  const prefix = `tenant-policy-${index}`;
  const node = el('fieldset', { className: 'card', dataset: { bookingPolicyId: version.id } }, [
    el('legend', { text: t('tenantSettings.bookingPolicies.version', { date: formatDateTime(version.effectiveFrom) }) }),
    el('p', { className: 'muted', text: immutable ? t('tenantSettings.bookingPolicies.immutable') : t('tenantSettings.bookingPolicies.scheduled') }),
    el('div', { className: 'form-grid' }, [
      field({ id: `${prefix}-effective`, label: t('tenantSettings.bookingPolicies.effectiveFrom'), control: controls.effectiveFrom, required: true }),
      field({ id: `${prefix}-lead`, label: t('tenantSettings.bookingPolicies.minimumLeadTime'), control: controls.minimumLeadTimeMinutes, required: true }),
      field({ id: `${prefix}-advance`, label: t('tenantSettings.bookingPolicies.maximumAdvance'), control: controls.maximumAdvanceMinutes, required: true }),
      field({ id: `${prefix}-cancel`, label: t('tenantSettings.bookingPolicies.cancellationWindow'), control: controls.cancellationWindowMinutes, required: true }),
      field({ id: `${prefix}-change`, label: t('tenantSettings.bookingPolicies.changeWindow'), control: controls.changeWindowMinutes, required: true }),
      field({ id: `${prefix}-participants`, label: t('tenantSettings.bookingPolicies.maximumParticipants'), control: controls.maximumParticipants, required: true }),
      field({ id: `${prefix}-sites`, label: t('tenantSettings.bookingPolicies.allowedSiteIds'), control: controls.allowedSiteIds, optional: true, hint: t('tenantSettings.common.commaSeparated') }),
      field({ id: `${prefix}-rooms`, label: t('tenantSettings.bookingPolicies.allowedRoomIds'), control: controls.allowedRoomIds, optional: true, hint: t('tenantSettings.common.commaSeparated') }),
      field({ id: `${prefix}-services`, label: t('tenantSettings.bookingPolicies.allowedServiceIds'), control: controls.allowedServiceIds, optional: true, hint: t('tenantSettings.common.commaSeparated') }),
    ]),
  ]);
  return { node, controls, version, immutable };
}

function readVersion(editor) {
  if (editor.immutable) return structuredClone(editor.version);
  const { controls, version } = editor;
  const effectiveFrom = new Date(controls.effectiveFrom.value).toISOString();
  if (new Date(effectiveFrom).getTime() <= Date.now()) throw new TypeError('BOOKING_POLICY_RETROACTIVE_INVALID');
  const rules = {
    minimumLeadTimeMinutes: Number(controls.minimumLeadTimeMinutes.value),
    maximumAdvanceMinutes: Number(controls.maximumAdvanceMinutes.value),
    cancellationWindowMinutes: Number(controls.cancellationWindowMinutes.value),
    changeWindowMinutes: Number(controls.changeWindowMinutes.value),
    maximumParticipants: Number(controls.maximumParticipants.value),
    allowedSiteIds: ids(controls.allowedSiteIds.value), allowedRoomIds: ids(controls.allowedRoomIds.value),
    allowedServiceIds: ids(controls.allowedServiceIds.value),
  };
  if ([rules.minimumLeadTimeMinutes, rules.cancellationWindowMinutes, rules.changeWindowMinutes]
    .some((value) => value > rules.maximumAdvanceMinutes)) throw new TypeError('BOOKING_POLICY_WINDOW_INVALID');
  return { id: version.id, effectiveFrom, rules };
}

export function createBookingPoliciesSection({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('BOOKING_POLICIES_SECTION_ADAPTER_INVALID');
  let pendingDraft = null;
  let focusAfterSave = false;

  async function render({ root, isCurrent, rerender }) {
    renderSectionLoading(root, TITLE);
    let snapshot;
    let history;
    try { [snapshot, history] = await Promise.all([adapter.loadBookingPolicies(), adapter.listBookingPoliciesHistory({ limit: 20 })]); }
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
    const editors = snapshot.configuration.versions.map(versionEditor);
    const versionsSurface = el('div', {}, editors.map((entry) => entry.node));
    const add = button(t('tenantSettings.bookingPolicies.addVersion'));
    add.addEventListener('click', () => {
      const count = editors.length + 1;
      const future = new Date(Date.now() + 86_400_000);
      future.setUTCHours(0, 0, 0, 0);
      const source = snapshot.configuration.versions.at(-1);
      const id = nextId(new Set(editors.map((entry) => entry.version.id)));
      const editor = versionEditor({ id, effectiveFrom: future.toISOString(), rules: structuredClone(source.rules) }, count - 1);
      editors.push(editor);
      versionsSurface.appendChild(editor.node);
      editor.controls.effectiveFrom.focus();
    });
    form.append(versionsSurface, el('div', { className: 'button-row' }, [add]));
    const status = el('p', { attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
    const save = button(t('tenantSettings.action.save'), { className: 'primary', attrs: { type: 'submit' } });
    let mutationPending = false;
    form.append(el('div', { className: 'button-row' }, [save]), status);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (mutationPending) return;
      if (!form.reportValidity()) return;
      try {
        const versions = editors.map(readVersion).sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
        if (new Set(versions.map((entry) => entry.effectiveFrom)).size !== versions.length) throw new TypeError('BOOKING_POLICY_EFFECTIVE_DUPLICATE');
        pendingDraft = { versions };
      } catch {
        validationSummary(form, t('tenantSettings.validation.checkFields'));
        form.querySelector('input:not([disabled])')?.focus();
        return;
      }
      save.disabled = true;
      mutationPending = true;
      status.textContent = t('tenantSettings.status.saving');
      try {
        await adapter.saveBookingPolicies({ expectedRevision: snapshot.revision, configuration: pendingDraft });
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
              const current = await adapter.loadBookingPolicies();
              await adapter.saveBookingPolicies({ expectedRevision: current.revision, configuration: pendingDraft });
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
    history.forEach((entry) => historyList.appendChild(el('li', { text: t('tenantSettings.history.entry', { revision: entry.revision, date: formatDateTime(entry.changedAt) }) })));
    clear(root);
    root.append(
      el('section', { className: 'card' }, [
        el('h2', { text: t(TITLE), attrs: { tabindex: '-1' } }), el('p', { text: t('tenantAdmin.bookingPolicies.description') }),
        el('p', { className: 'muted', text: t('tenantAdmin.section.revision', { revision: snapshot.revision }) }), form,
      ]),
      el('section', { className: 'card' }, [el('h3', { text: t('tenantSettings.history.title') }), historyList]),
    );
    if (focusAfterSave) { focusAfterSave = false; requestAnimationFrame(() => root.querySelector('h2')?.focus()); }
  }

  return defineTenantAdminSection({
    id: 'booking-policies', titleKey: TITLE, descriptionKey: 'tenantAdmin.bookingPolicies.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.CONFIGURE, available: validAdapter(adapter), render,
  });
}

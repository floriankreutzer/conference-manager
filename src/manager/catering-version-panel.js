import { formatDateTime, formatNumber, locale, t } from '../core/i18n.js';
import { button, el, field } from '../core/ui.js';
import { authorityFailureCode } from '../shared/authority-failure.js';
import { cateringMoneyText } from './catering-quote-draft.js';

export function createCateringVersionPanel({ root, adapter, view, isCurrent, onPropose, onOpenVersion, onAuthorityFailure }) {
  const status = el('p', { attrs: { role: 'status', 'aria-live': 'polite' } });
  const basis = el('p'); const forms = el('div'); const history = el('div', { className: 'form-grid' });
  const makeButton = (key) => button(t(`cateringVersions.${key}`), { dataset: { versionControl: 'true' } });
  const reload = makeButton('reload'); const first = makeButton('first'); const next = makeButton('next');
  const original = button(t('cateringVersions.open', { version: formatNumber(1) }), { dataset: { versionControl: 'true' } });
  original.addEventListener('click', () => { if (!loading && !parentBusy && isCurrent()) onOpenVersion(1); });
  root.append(el('h4', { text: t('cateringVersions.title') }), el('p', { text: t('cateringVersions.description') }),
    el('div', { className: 'button-row' }, [reload,first,next]), status, basis, forms, original, history);
  let page = null; let loading = false; let parentBusy = false; let readReady = false;
  function controls() {
    root.setAttribute('aria-busy', String(loading || parentBusy));
    for (const control of root.querySelectorAll('button,select,textarea')) control.disabled = loading || parentBusy;
    next.disabled ||= !page?.nextAfterOrderVersion;
    original.hidden = view.order.orderVersion === 1;
    for (const control of forms.querySelectorAll('button')) control.disabled ||= !readReady;
  }
  function present() {
    basis.textContent = page.basis === null ? t('cateringVersions.noBasis') : t('cateringVersions.basis', {
      version: formatNumber(page.basis.orderVersion), status: t(`cateringOrders.state.${page.basis.status}`),
      amount: cateringMoneyText(page.basis.providerCost, locale()),
    });
    history.replaceChildren();
    for (const proposal of page.proposals) {
      const open = button(t('cateringVersions.open', { version: formatNumber(proposal.orderVersion) }), {
        dataset: { versionControl: 'true' },
      });
      open.addEventListener('click', () => { if (!loading && !parentBusy && isCurrent()) onOpenVersion(proposal.orderVersion); });
      history.appendChild(el('article', { className: 'card' }, [
        el('h5', { text: t(`cateringVersions.operation.${proposal.operation}`) }),
        el('p', { text: t('cateringVersions.proposal', { version: formatNumber(proposal.orderVersion),
          basis: formatNumber(proposal.basisOrderVersion), date: formatDateTime(proposal.proposedAt) }) }),
        el('p', { text: proposal.justification }), open,
      ]));
    }
    if (!page.proposals.length) history.appendChild(el('p', { text: t('cateringVersions.empty') }));
    if (forms.childElementCount) return;
    if (!page.allowedOperations.length) { forms.appendChild(el('p', { text: t('cateringVersions.unavailable') })); return; }
    const form = el('form', { className: 'card' });
    const operation = el('select', { dataset: { versionControl: 'true' }, attrs: { required: 'required' } });
    operation.append(el('option', { value: '', text: t('cateringVersions.choose') }),
      ...page.allowedOperations.map((value) => el('option', { value, text: t(`cateringVersions.operation.${value}`) })));
    const reason = el('textarea', { dataset: { versionControl: 'true' }, attrs: { required: 'required', maxlength: '1000', rows: '3' } });
    reason.addEventListener('input', () => { reason.removeAttribute('aria-invalid'); });
    const save = makeButton('save'); save.type = 'submit';
    form.append(el('h5', { text: t('cateringVersions.new') }), el('p', { text: t('cateringVersions.warning') }),
      field({ id: 'catering-version-operation', label: t('cateringVersions.operation'), control: operation, required: true }),
      field({ id: 'catering-version-reason', label: t('cateringVersions.reason'), control: reason, required: true }), save);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (loading || parentBusy || !readReady || !isCurrent() || !form.reportValidity()) return;
      const justification = reason.value.trim();
      if (!justification.length || justification.length > 1000 || /[\u0000-\u001f\u007f]/.test(justification)) {
        reason.setAttribute('aria-invalid', 'true'); status.textContent = t('cateringVersions.invalidReason'); reason.focus(); return;
      }
      if (!page.allowedOperations.includes(operation.value)) return;
      onPropose({ orderId: view.order.orderId, commandId: crypto.randomUUID(), expectedOrderVersion: view.order.orderVersion,
        expectedStateRevision: view.state.revision, expectedRequestVersion: page.currentRequest.version,
        expectedAssignmentRevision: operation.value === 'change' ? page.currentAssignmentRevision : page.basis.assignmentRevision,
        operation: operation.value, justification });
    });
    forms.appendChild(form);
  }
  async function load(afterOrderVersion = 1, trigger = null) {
    if (loading || parentBusy || !isCurrent()) return;
    const restore = trigger !== null && document.activeElement === trigger;
    const priorSource = page === null ? null : JSON.stringify([page.currentRequest,page.currentAssignmentRevision,page.basis,page.allowedOperations]);
    loading = true; readReady = false; controls(); status.textContent = t('cateringVersions.loading');
    try {
      const loaded = await adapter.loadVersionProposals({ orderId: view.order.orderId, afterOrderVersion });
      if (!isCurrent()) return;
      if (loaded.orderState.orderVersion !== view.order.orderVersion || loaded.orderState.revision !== view.state.revision
        || loaded.orderState.status !== view.state.status || loaded.requestId !== view.order.requestId) {
        page = null; forms.replaceChildren(); history.replaceChildren(); status.textContent = t('cateringVersions.stale'); return;
      }
      page = loaded; readReady = true;
      if (priorSource !== JSON.stringify([page.currentRequest,page.currentAssignmentRevision,page.basis,page.allowedOperations])) {
        forms.replaceChildren();
      }
      present(); status.textContent = t('cateringVersions.loaded');
    } catch (error) {
      if (authorityFailureCode(error)) { onAuthorityFailure(error); return; }
      if (isCurrent()) { page = null; forms.replaceChildren(); history.replaceChildren(); status.textContent = t('cateringVersions.error'); }
    } finally {
      loading = false;
      if (isCurrent()) {
        controls();
        if (restore && [document.body,trigger].includes(document.activeElement)) {
          const target = trigger.disabled ? reload : trigger; if (!target.disabled) target.focus();
        }
      }
    }
  }
  reload.addEventListener('click', () => { void load(1, reload); });
  first.addEventListener('click', () => { void load(1, first); });
  next.addEventListener('click', () => { if (page?.nextAfterOrderVersion) void load(page.nextAfterOrderVersion, next); });
  void load();
  return Object.freeze({ setBusy(value) { parentBusy = value; controls(); } });
}

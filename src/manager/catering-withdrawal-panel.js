import { formatDateTime, formatNumber, t } from '../core/i18n.js';
import { button, el, field } from '../core/ui.js';
import { authorityFailureCode } from '../shared/authority-failure.js';

export function createCateringWithdrawalPanel({ root, adapter, view, readOnly = false, isCurrent, onWithdraw, onAuthorityFailure }) {
  const status = el('p', { attrs: { role: 'status', 'aria-live': 'polite' } });
  const facts = el('div'); const forms = el('div');
  const reload = button(t('cateringWithdrawal.reload'), { dataset: { withdrawalControl: 'true' } });
  root.append(el('h4', { text: t('cateringWithdrawal.title') }), el('p', { text: t('cateringWithdrawal.description') }),
    reload, status, facts, forms);
  let loading = false; let parentBusy = false; let ready = false; let page = null;
  function controls() {
    root.setAttribute('aria-busy', String(loading || parentBusy));
    for (const control of root.querySelectorAll('button,input,textarea')) control.disabled = loading || parentBusy;
    for (const control of forms.querySelectorAll('button')) control.disabled ||= !ready || readOnly;
  }
  function present() {
    facts.replaceChildren();
    if (page.effective) facts.appendChild(el('p', { text: t('cateringWithdrawal.retained', {
      version: formatNumber(page.effective.orderVersion), status: t(`cateringOrders.state.${page.effective.status}`),
    }) }));
    if (page.withdrawal) facts.append(el('p', { text: t('cateringWithdrawal.recorded', {
      date: formatDateTime(page.withdrawal.recordedAt),
    }) }), el('p', { text: page.withdrawal.justification }), el('p', { text: t('cateringWithdrawal.attestationRecorded') }));
    if (forms.childElementCount) return;
    if (readOnly || !page.eligible) {
      if (!page.withdrawal) forms.appendChild(el('p', { text: t('cateringWithdrawal.unavailable') }));
      return;
    }
    const form = el('form', { className: 'card' });
    const reason = el('textarea', { dataset: { withdrawalControl: 'true' }, attrs: { required: 'required', maxlength: '1000', rows: '3' } });
    reason.addEventListener('input', () => { reason.removeAttribute('aria-invalid'); });
    const attest = el('input', { type: 'checkbox', dataset: { withdrawalControl: 'true' }, attrs: { required: 'required' } });
    const save = button(t('cateringWithdrawal.save'), { type: 'submit', dataset: { withdrawalControl: 'true' } });
    form.append(field({ id: 'catering-withdrawal-reason', label: t('cateringWithdrawal.reason'), control: reason, required: true }),
      field({ id: 'catering-withdrawal-attest', label: t('cateringWithdrawal.attest'), control: attest, required: true }), save);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (loading || parentBusy || !ready || readOnly || !isCurrent() || !form.reportValidity() || !attest.checked) return;
      const justification = reason.value.trim();
      if (!justification.length || justification.length > 1000 || /[\u0000-\u001f\u007f]/.test(justification)) {
        reason.setAttribute('aria-invalid', 'true'); status.textContent = t('cateringVersions.invalidReason'); reason.focus(); return;
      }
      onWithdraw({ orderId: view.order.orderId, commandId: crypto.randomUUID(), expectedOrderVersion: view.order.orderVersion,
        expectedStateRevision: view.state.revision, justification, attestNotTransmitted: true });
    });
    forms.appendChild(form);
  }
  async function load(trigger = null) {
    if (loading || parentBusy || !isCurrent()) return;
    const restore = trigger !== null && document.activeElement === trigger;
    const prior = page === null ? null : JSON.stringify(page);
    loading = true; ready = false; controls(); status.textContent = t('cateringWithdrawal.loading');
    try {
      const loaded = await adapter.loadWithdrawal({ orderId: view.order.orderId, orderVersion: view.order.orderVersion });
      if (!isCurrent()) return;
      if (loaded.orderState.orderVersion !== view.order.orderVersion || loaded.orderState.revision !== view.state.revision
        || loaded.orderState.status !== view.state.status) {
        page = null; forms.replaceChildren(); facts.replaceChildren(); status.textContent = t('cateringVersions.stale'); return;
      }
      page = loaded; ready = true;
      if (prior !== JSON.stringify(page)) forms.replaceChildren();
      present(); status.textContent = t('cateringWithdrawal.loaded');
    } catch (error) {
      if (authorityFailureCode(error)) { onAuthorityFailure(error); return; }
      if (isCurrent()) {
        page = null; forms.replaceChildren(); facts.replaceChildren(); status.textContent = t('cateringWithdrawal.error');
      }
    } finally {
      loading = false;
      if (isCurrent()) {
        controls();
        if (restore && !reload.disabled && [document.body,trigger].includes(document.activeElement)) reload.focus();
      }
    }
  }
  reload.addEventListener('click', () => { void load(reload); }); void load();
  return Object.freeze({ setBusy(value) { parentBusy = value; controls(); } });
}

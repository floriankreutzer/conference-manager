import { formatDateTime, formatNumber, t } from '../core/i18n.js';
import { button, el } from '../core/ui.js';
import { authorityFailureCode } from '../shared/authority-failure.js';

// Presentation only. Enqueue uses the parent's uncertainty/concurrency lifecycle;
// no browser retry, worker timer, delivery attestation or provider call is made.
export function createCateringDeliveryPanel({ root, adapter, view, isCurrent, onEnqueue, onAuthorityFailure }) {
  const status = el('p', { attrs: { role: 'status', 'aria-live': 'polite' } });
  const list = el('div', { className: 'form-grid' });
  const makeButton = (key) => button(t(`cateringDelivery.${key}`), { dataset: { deliveryControl: 'true' } });
  const reload = makeButton('reload'); const first = makeButton('first'); const next = makeButton('next');
  const enqueue = makeButton('enqueue');
  const eligible = view.state.status === 'released' && view.decision?.decision === 'approved'
    && view.quote && !view.quote.expired && Date.parse(view.quote.expiresAt) > Date.now();
  root.append(el('h4', { text: t('cateringDelivery.title') }), el('p', { text: t('cateringDelivery.description') }),
    el('div', { className: 'button-row' }, [...(eligible ? [enqueue] : []), reload, first, next]), status, list);
  let page = null; let loading = false; let parentBusy = false; let readReady = false; let hasJobs = false;
  function controls() {
    root.setAttribute('aria-busy', String(loading || parentBusy));
    for (const control of [reload,first,next,enqueue]) control.disabled = loading || parentBusy;
    next.disabled ||= !page?.nextAfterJobId;
    enqueue.disabled ||= !eligible || !readReady || hasJobs || Date.parse(view.quote?.expiresAt) <= Date.now();
  }
  function present() {
    list.replaceChildren();
    for (const job of page.jobs) {
      const facts = [
        ['version', formatNumber(job.orderVersion)], ['operation', t(`cateringDelivery.operation.${job.operation}`)],
        ['attempts', formatNumber(job.dispatchAttempts)], ['reads', formatNumber(job.automaticReconciliationAttempts)],
        ['updated', formatDateTime(job.updatedAt)],
      ];
      if (job.availableAt) facts.push(['available', formatDateTime(job.availableAt)]);
      list.appendChild(el('article', { className: 'card' }, [
        el('h5', { text: t(`cateringDelivery.state.${job.status}`) }),
        el('dl', { className: 'manager-detail-list catering-delivery-facts' }, facts.map(([key, value]) => el('div', {}, [
          el('dt', { text: t(`cateringDelivery.${key}`) }), el('dd', { text: value }),
        ]))),
        ...(job.status === 'deferred' ? [el('p', { text: t('cateringDelivery.manualFollowUp') })] : []),
      ]));
    }
    if (!page.jobs.length) list.appendChild(el('p', { text: t('cateringDelivery.empty') }));
  }
  async function load(afterJobId = null, trigger = null) {
    if (loading || parentBusy || !isCurrent()) return;
    const restoreFocus = trigger !== null && document.activeElement === trigger;
    loading = true; readReady = false; controls(); status.textContent = t('cateringDelivery.loading');
    try {
      const loaded = await adapter.listJobs({ orderId: view.order.orderId, afterJobId });
      if (!isCurrent()) return;
      page = loaded; readReady = true; hasJobs ||= page.jobs.length > 0;
      present(); status.textContent = t('cateringDelivery.loaded');
    } catch (error) {
      if (authorityFailureCode(error)) { onAuthorityFailure(error); return; }
      if (isCurrent()) status.textContent = t('cateringDelivery.error');
    } finally {
      loading = false;
      if (isCurrent()) {
        controls();
        if (restoreFocus && [document.body,trigger].includes(document.activeElement)) {
          const target = trigger.disabled ? reload : trigger;
          if (!target.disabled) target.focus();
        }
      }
    }
  }
  reload.addEventListener('click', () => { void load(null, reload); });
  first.addEventListener('click', () => { void load(null, first); });
  next.addEventListener('click', () => { if (page?.nextAfterJobId) void load(page.nextAfterJobId, next); });
  enqueue.addEventListener('click', () => {
    if (loading || parentBusy || !isCurrent() || enqueue.disabled) return;
    onEnqueue();
  });
  void load();
  return Object.freeze({ setBusy(value) { parentBusy = value; controls(); } });
}

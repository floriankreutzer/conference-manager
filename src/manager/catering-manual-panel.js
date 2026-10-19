import { formatDateTime, formatNumber, t } from '../core/i18n.js';
import { button, el, field } from '../core/ui.js';
import { authorityFailureCode } from '../shared/authority-failure.js';
import { cateringManualOccurrence } from './catering-manual-draft.js';

export function createCateringManualPanel({ root, adapter, view, isCurrent, onRecord, onAuthorityFailure }) {
  const status = el('p', { attrs: { role: 'status', 'aria-live': 'polite' } });
  const effective = el('p'); const history = el('div', { className: 'form-grid' }); const forms = el('div');
  const makeButton = (key) => button(t(`cateringManual.${key}`), { dataset: { manualControl: 'true' } });
  const reload = makeButton('reload'); const first = makeButton('first'); const next = makeButton('next');
  root.append(el('h4', { text: t('cateringManual.title') }), el('p', { text: t('cateringManual.description') }),
    el('div', { className: 'button-row' }, [reload,first,next]), status, effective, forms, history);
  let page = null; let loading = false; let parentBusy = false; let readReady = false;
  const expected = { orderId: view.order.orderId, orderVersion: view.order.orderVersion,
    positionIds: view.order.positions.map((position) => position.positionId) };
  function controls() {
    root.setAttribute('aria-busy', String(loading || parentBusy));
    for (const control of root.querySelectorAll('button,input,select')) control.disabled = loading || parentBusy;
    next.disabled ||= !page?.nextAfterSequence;
    for (const control of forms.querySelectorAll('button')) control.disabled ||= !readReady;
  }
  function presentHistory() {
    history.replaceChildren();
    effective.textContent = page.effective === null ? t('cateringManual.noEffective') : t('cateringManual.effective', {
      version: formatNumber(page.effective.orderVersion), status: t(`cateringOrders.state.${page.effective.status}`),
    });
    for (const fact of page.events) {
      const facts = [['sequence', formatNumber(fact.sequence)], ['channel', t(`cateringManual.channel.${fact.channel}`)],
        ['reference', fact.reference], ['occurred', formatDateTime(fact.occurredAt)], ['recorded', formatDateTime(fact.recordedAt)]];
      const card = el('article', { className: 'card' }, [el('h5', { text: t(`cateringManual.record.${fact.kind}`) }),
        el('p', { text: t(`cateringOrders.state.${fact.status}`) }),
        el('dl', { className: 'manager-detail-list catering-delivery-facts' }, facts.map(([key, text]) => el('div', {}, [
          el('dt', { text: t(`cateringManual.${key}`) }), el('dd', { text }),
        ]))),
      ]);
      if (fact.receipt) card.appendChild(el('ul', {}, fact.receipt.positions.map((position) => el('li', { text:
        `${view.order.positions.find((line) => line.positionId === position.positionId).name}: ${t(`cateringManual.outcome.${position.outcome}`)}`,
      }))));
      history.appendChild(card);
    }
    if (!page.events.length) history.appendChild(el('p', { text: t('cateringManual.empty') }));
  }
  function presentForm() {
    forms.replaceChildren();
    if (view.providerId !== 'manual_catering' || view.decision?.decision !== 'approved'
      || !['queued','transmitted','partially_confirmed','rejected','confirmed','cancelled'].includes(view.state.status)) return;
    const kind = page.manualSequence === 0 ? 'transmitted' : 'receipt';
    if ((kind === 'transmitted') !== (view.state.status === 'queued')) return;
    const form = el('form', { className: 'card' });
    const channel = el('select', { dataset: { manualControl: 'true' }, attrs: { required: 'required' } });
    channel.append(el('option', { value: '', text: t('cateringManual.choose') }),
      ...['email','telephone','portal','in_person','other'].map((value) => el('option', { value, text: t(`cateringManual.channel.${value}`) })));
    const reference = el('input', { type: 'text', dataset: { manualControl: 'true' },
      attrs: { required: 'required', maxlength: '200' } });
    reference.addEventListener('input', () => { reference.removeAttribute('aria-invalid'); });
    const occurred = el('input', { type: 'datetime-local', dataset: { manualControl: 'true' }, attrs: { required: 'required', step: '0.001' } });
    form.append(el('h5', { text: t(`cateringManual.kind.${kind}`) }),
      field({ id: 'catering-manual-channel', label: t('cateringManual.channel'), control: channel, required: true }),
      field({ id: 'catering-manual-reference', label: t('cateringManual.reference'), control: reference, required: true }),
      el('p', { text: t('cateringManual.referenceHint') }),
      field({ id: 'catering-manual-occurred', label: t('cateringManual.occurredInput'), control: occurred, required: true }),
      el('p', { text: t('cateringManual.timeHint') }));
    const outcomes = [];
    if (kind === 'receipt') {
      const positions = el('fieldset', {}, [el('legend', { text: t('cateringManual.positions') })]);
      for (const [index, position] of view.order.positions.entries()) {
        const select = el('select', { dataset: { manualControl: 'true' }, attrs: { required: 'required' } });
        select.append(el('option', { value: '', text: t('cateringManual.choose') }),
          ...['pending','confirmed','rejected','substitution_proposed'].map((value) => el('option', {
            value, text: t(`cateringManual.outcome.${value}`),
          })));
        positions.appendChild(field({ id: `catering-manual-position-${index}`, label: position.name, control: select, required: true }));
        outcomes.push({ position, select });
      }
      form.append(positions, el('p', { text: t('cateringManual.substitutionHint') }));
    }
    const attest = el('input', { type: 'checkbox', dataset: { manualControl: 'true' }, attrs: { required: 'required' } });
    const save = makeButton('save'); save.type = 'submit';
    form.append(field({ id: 'catering-manual-attest', label: t(`cateringManual.attest.${kind}`), control: attest, required: true }), save);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (loading || parentBusy || !readReady || !isCurrent() || !form.reportValidity()) return;
      if (reference.value !== reference.value.trim() || !/^[A-Za-z0-9][A-Za-z0-9 ._/#-]{0,199}$/.test(reference.value)) {
        reference.setAttribute('aria-invalid', 'true');
        status.textContent = t('cateringManual.invalidReference'); reference.focus(); return;
      }
      let occurredAt;
      try {
        occurredAt = cateringManualOccurrence(occurred.value);
      } catch { status.textContent = t('cateringManual.invalidTime'); occurred.focus(); return; }
      const receipt = kind === 'transmitted' ? null : { orderId: expected.orderId, orderVersion: expected.orderVersion,
        positions: outcomes.map(({ position, select }) => ({ positionId: position.positionId, outcome: select.value })) };
      onRecord({ orderId: expected.orderId, expectedOrderVersion: expected.orderVersion, expectedStateRevision: view.state.revision,
        expectedQuoteRevision: view.quote.revision, expectedDecisionSequence: view.decision.sequence,
        positionIds: expected.positionIds, commandId: crypto.randomUUID(), kind, channel: channel.value,
        reference: reference.value, occurredAt, receipt });
    });
    forms.appendChild(form);
  }
  async function load(afterSequence = 0, trigger = null) {
    if (loading || parentBusy || !isCurrent()) return;
    const restore = trigger !== null && document.activeElement === trigger;
    loading = true; readReady = false; controls(); status.textContent = t('cateringManual.loading');
    try {
      const loaded = await adapter.loadManualFacts({ ...expected, afterSequence });
      if (!isCurrent()) return;
      if (loaded.orderState.revision !== view.state.revision || loaded.orderState.status !== view.state.status) {
        forms.replaceChildren(); page = null; status.textContent = t('cateringManual.stale'); return;
      }
      page = loaded; readReady = true; presentHistory();
      if (forms.childElementCount === 0) presentForm();
      status.textContent = t('cateringManual.loaded');
    } catch (error) {
      if (authorityFailureCode(error)) { onAuthorityFailure(error); return; }
      if (isCurrent()) { forms.replaceChildren(); status.textContent = t('cateringManual.error'); }
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
  reload.addEventListener('click', () => { void load(0, reload); });
  first.addEventListener('click', () => { void load(0, first); });
  next.addEventListener('click', () => { if (page?.nextAfterSequence) void load(page.nextAfterSequence, next); });
  void load();
  return Object.freeze({ setBusy(value) { parentBusy = value; controls(); } });
}

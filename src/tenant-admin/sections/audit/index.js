import { formatDateTime, formatNumber, t } from '../../../core/i18n.js';
import { announce, button, clear, el } from '../../../core/ui.js';
import {
  TENANT_ADMIN_SECTION_PERMISSION,
  defineTenantAdminSection,
} from '../../section-contract.js';
import {
  renderSectionEmpty,
  renderSectionError,
  renderSectionLoading,
} from '../../section-presentation.js';
import {
  AUDIT_FILTER_DEFAULTS,
  auditActionKey,
  auditErrorKey,
  auditFilterErrorKey,
  auditTargetTypeKey,
  normalizedAuditFilters,
} from './model.js';

const PAGE_SIZE = 20;
const SUMMARY_STRING_KEYS = new Map([
  ['active', 'active'],
  ['archived', 'archived'],
  ['Cancelled', 'cancelled'],
  ['Change Requested', 'changeRequested'],
  ['Confirmed', 'confirmed'],
  ['connected', 'connected'],
  ['degraded', 'degraded'],
  ['disabled', 'disabled'],
  ['disconnected', 'disconnected'],
  ['In Review', 'inReview'],
  ['microsoft365', 'microsoft365'],
  ['microsoft_entra', 'microsoft_entra'],
  ['missing', 'missing'],
  ['onboarding', 'onboarding'],
  ['pending', 'pending'],
  ['ready', 'ready'],
  ['Rejected', 'rejected'],
  ['revoked', 'revoked'],
  ['Submitted', 'submitted'],
  ['suspended', 'suspended'],
  ['unbound', 'unbound'],
]);

function validAdapter(adapter) {
  return adapter !== null && typeof adapter?.listAuditEvents === 'function';
}

function selectControl({ id, labelKey, value, choices }) {
  const control = el('select', { id, name: id });
  choices.forEach(([optionValue, key]) => {
    control.appendChild(el('option', { value: optionValue, text: t(key) }));
  });
  control.value = value || '';
  return el('label', { className: 'field' }, [
    el('span', { className: 'field-label', text: t(labelKey) }),
    control,
  ]);
}

function summaryValue(value) {
  if (typeof value === 'boolean') {
    return t(value ? 'tenantAdmin.operations.common.yes' : 'tenantAdmin.operations.common.no');
  }
  if (typeof value === 'number') return formatNumber(value);
  return SUMMARY_STRING_KEYS.has(value)
    ? t(`tenantAdmin.operations.audit.summaryValue.${SUMMARY_STRING_KEYS.get(value)}`)
    : t('tenantAdmin.operations.common.notAvailable');
}

function stateSummary(labelKey, value) {
  const section = el('section', { className: 'tenant-audit-state' }, [
    el('h4', { text: t(labelKey) }),
  ]);
  if (value === null || Object.keys(value).length === 0) {
    section.appendChild(el('p', { className: 'muted', text: t('tenantAdmin.operations.common.notAvailable') }));
    return section;
  }
  const list = el('dl', { className: 'tenant-operations-metadata' });
  Object.entries(value).forEach(([key, entry]) => {
    list.append(
      el('dt', { text: t(`tenantAdmin.operations.audit.summary.${key}`) }),
      el('dd', { text: summaryValue(entry) }),
    );
  });
  section.appendChild(list);
  return section;
}

function auditEvent(event) {
  const headingId = `tenant-audit-event-${event.id}`;
  const target = event.target.id === null
    ? t(auditTargetTypeKey(event.target.type))
    : t('tenantAdmin.operations.audit.targetWithId', {
      type: t(auditTargetTypeKey(event.target.type)),
      id: event.target.id,
    });
  const item = el('li', {
    className: 'card tenant-audit-event',
    attrs: { 'aria-labelledby': headingId },
  }, [
    el('header', { className: 'tenant-audit-event-header' }, [
      el('h3', { id: headingId, text: t(auditActionKey(event.action)) }),
      el('span', {
        className: `status-chip tenant-operation-outcome-${event.outcome}`,
        text: t(`tenantAdmin.operations.audit.outcome.${event.outcome}`),
      }),
    ]),
    el('dl', { className: 'tenant-operations-metadata' }, [
      el('dt', { text: t('tenantAdmin.operations.audit.actor') }),
      el('dd', {
        className: 'tenant-operation-identifier',
        text: event.actor.userId || t('tenantAdmin.operations.audit.actor.system'),
      }),
      el('dt', { text: t('tenantAdmin.operations.audit.target') }),
      el('dd', { className: 'tenant-operation-identifier', text: target }),
      el('dt', { text: t('tenantAdmin.operations.audit.occurredAt') }),
      el('dd', {}, [
        el('time', {
          text: formatDateTime(event.occurredAt),
          attrs: { datetime: event.occurredAt },
        }),
      ]),
      el('dt', { text: t('tenantAdmin.operations.audit.correlation') }),
      el('dd', { className: 'tenant-operation-identifier', text: event.correlationId }),
    ]),
  ]);
  if (event.change.before !== null || event.change.after !== null) {
    const details = el('details', { className: 'tenant-audit-change' }, [
      el('summary', { text: t('tenantAdmin.operations.audit.change') }),
      el('div', { className: 'tenant-audit-state-grid' }, [
        stateSummary('tenantAdmin.operations.audit.before', event.change.before),
        stateSummary('tenantAdmin.operations.audit.after', event.change.after),
      ]),
    ]);
    item.appendChild(details);
  }
  return item;
}

export function createAuditSection({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('AUDIT_SECTION_ADAPTER_INVALID');

  let filters = AUDIT_FILTER_DEFAULTS;
  let beforeId = null;
  let nextBeforeId = null;
  let cursorHistory = [];
  let pendingFocus = false;

  function filterForm(rerender) {
    const actor = el('input', {
      id: 'tenant-audit-actor-filter',
      name: 'tenant-audit-actor-filter',
      type: 'text',
      value: filters.actorUserId || '',
      attrs: { maxlength: '36', autocomplete: 'off' },
    });
    const from = el('input', {
      id: 'tenant-audit-from-filter',
      name: 'tenant-audit-from-filter',
      type: 'date',
      value: filters.fromDate,
    });
    const to = el('input', {
      id: 'tenant-audit-to-filter',
      name: 'tenant-audit-to-filter',
      type: 'date',
      value: filters.toDate,
    });
    const form = el('form', {
      className: 'card tenant-operations-filter',
      dataset: { tenantAuditFilters: 'true' },
      attrs: { 'aria-labelledby': 'tenant-audit-filter-heading' },
    }, [
      el('h3', { id: 'tenant-audit-filter-heading', text: t('tenantAdmin.operations.audit.filters') }),
      el('div', { className: 'tenant-operations-filter-grid' }, [
        selectControl({
          id: 'tenant-audit-category-filter',
          labelKey: 'tenantAdmin.operations.audit.category',
          value: filters.category,
          choices: [
            ['', 'tenantAdmin.operations.common.all'],
            ['user', 'tenantAdmin.operations.audit.category.user'],
            ['configuration', 'tenantAdmin.operations.audit.category.configuration'],
            ['request', 'tenantAdmin.operations.audit.category.request'],
            ['integration', 'tenantAdmin.operations.audit.category.integration'],
            ['security', 'tenantAdmin.operations.audit.category.security'],
          ],
        }),
        selectControl({
          id: 'tenant-audit-outcome-filter',
          labelKey: 'tenantAdmin.operations.audit.outcome',
          value: filters.outcome,
          choices: [
            ['', 'tenantAdmin.operations.common.all'],
            ['success', 'tenantAdmin.operations.audit.outcome.success'],
            ['failure', 'tenantAdmin.operations.audit.outcome.failure'],
            ['denied', 'tenantAdmin.operations.audit.outcome.denied'],
          ],
        }),
        el('label', { className: 'field' }, [
          el('span', { className: 'field-label', text: t('tenantAdmin.operations.audit.actorId') }),
          actor,
        ]),
        el('label', { className: 'field' }, [
          el('span', { className: 'field-label', text: t('tenantAdmin.operations.audit.from') }),
          from,
        ]),
        el('label', { className: 'field' }, [
          el('span', { className: 'field-label', text: t('tenantAdmin.operations.audit.toInclusive') }),
          to,
        ]),
      ]),
    ]);
    const feedback = el('p', {
      id: 'tenant-audit-filter-feedback',
      className: 'field-hint',
      attrs: { role: 'alert', 'aria-live': 'assertive', 'aria-atomic': 'true' },
    });
    const apply = button(t('tenantAdmin.operations.common.applyFilters'), {
      className: 'primary',
      type: 'submit',
    });
    const reset = button(t('tenantAdmin.operations.common.resetFilters'));
    reset.addEventListener('click', () => {
      filters = AUDIT_FILTER_DEFAULTS;
      beforeId = null;
      nextBeforeId = null;
      cursorHistory = [];
      pendingFocus = true;
      rerender();
    });
    form.append(feedback, el('div', { className: 'button-row' }, [apply, reset]));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      [actor, from, to].forEach((control) => {
        control.removeAttribute('aria-invalid');
        control.removeAttribute('aria-describedby');
      });
      feedback.textContent = '';
      const data = new FormData(form);
      try {
        filters = normalizedAuditFilters({
          category: data.get('tenant-audit-category-filter'),
          outcome: data.get('tenant-audit-outcome-filter'),
          actorUserId: data.get('tenant-audit-actor-filter'),
          fromDate: data.get('tenant-audit-from-filter'),
          toDate: data.get('tenant-audit-to-filter'),
        });
      } catch (error) {
        feedback.textContent = t(auditFilterErrorKey(error?.message));
        announce(feedback.textContent, { assertive: true });
        const focusTarget = error?.message === 'AUDIT_FILTER_ACTOR_INVALID'
          ? actor
          : (!from.value ? from : to);
        focusTarget.setAttribute('aria-invalid', 'true');
        focusTarget.setAttribute('aria-describedby', feedback.id);
        focusTarget.focus();
        return;
      }
      beforeId = null;
      nextBeforeId = null;
      cursorHistory = [];
      pendingFocus = true;
      rerender();
    });
    return form;
  }

  function pagination(rerender) {
    const previous = button(t('tenantAdmin.operations.common.previousPage'), {
      disabled: cursorHistory.length === 0,
      dataset: { tenantAuditPage: 'previous' },
    });
    previous.addEventListener('click', () => {
      beforeId = cursorHistory.pop() ?? null;
      pendingFocus = true;
      rerender();
    });
    const next = button(t('tenantAdmin.operations.common.nextPage'), {
      disabled: nextBeforeId === null,
      dataset: { tenantAuditPage: 'next' },
    });
    next.addEventListener('click', () => {
      if (nextBeforeId === null) return;
      cursorHistory.push(beforeId);
      beforeId = nextBeforeId;
      pendingFocus = true;
      rerender();
    });
    return el('nav', {
      className: 'tenant-operations-pagination',
      attrs: { 'aria-label': t('tenantAdmin.operations.audit.pagination') },
    }, [
      previous,
      el('span', {
        text: t('tenantAdmin.operations.common.page', { page: formatNumber(cursorHistory.length + 1) }),
      }),
      next,
    ]);
  }

  async function render({ root, isCurrent, rerender }) {
    clear(root);
    root.appendChild(el('section', { className: 'card tenant-admin-intro' }, [
      el('h2', { text: t('tenantAdmin.audit.title'), attrs: { tabindex: '-1' } }),
      el('p', { text: t('tenantAdmin.audit.description') }),
      el('p', { className: 'muted', text: t('tenantAdmin.operations.audit.integrityNote') }),
    ]));
    root.appendChild(filterForm(rerender));
    const surface = el('section', { dataset: { tenantAuditEvents: 'true' } });
    root.appendChild(surface);
    renderSectionLoading(surface, 'tenantAdmin.audit.title');
    try {
      const page = await adapter.listAuditEvents({
        limit: PAGE_SIZE,
        beforeId,
        category: filters.category,
        outcome: filters.outcome,
        actorUserId: filters.actorUserId,
        from: filters.from,
        to: filters.to,
      });
      if (!isCurrent()) return;
      nextBeforeId = page.nextBeforeId;
      clear(surface);
      const status = el('p', {
        className: 'tenant-operations-result-status',
        text: t('tenantAdmin.operations.audit.loaded', { count: formatNumber(page.events.length) }),
        attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', tabindex: '-1' },
      });
      const windowText = el('p', {
        className: 'muted',
        text: t('tenantAdmin.operations.audit.window', {
          from: formatDateTime(page.window.from),
          to: formatDateTime(page.window.to),
        }),
      });
      surface.append(status, windowText);
      if (!page.events.length) {
        const empty = el('div');
        renderSectionEmpty(empty, 'tenantAdmin.audit.title', 'tenantAdmin.audit.description');
        surface.append(...empty.childNodes);
      } else {
        const list = el('ol', { className: 'tenant-admin-audit-list' });
        page.events.forEach((entry) => list.appendChild(auditEvent(entry)));
        surface.appendChild(list);
      }
      surface.appendChild(pagination(rerender));
      announce(t('tenantAdmin.operations.audit.loaded', { count: formatNumber(page.events.length) }));
      if (pendingFocus) {
        pendingFocus = false;
        requestAnimationFrame(() => status.focus());
      }
    } catch (error) {
      if (!isCurrent()) return;
      const key = auditErrorKey(error?.code);
      renderSectionError(surface, 'tenantAdmin.audit.title');
      surface.appendChild(el('p', { attrs: { role: 'alert' }, text: t(key) }));
      announce(t(key), { assertive: true });
    }
  }

  return defineTenantAdminSection({
    id: 'audit',
    titleKey: 'tenantAdmin.audit.title',
    descriptionKey: 'tenantAdmin.audit.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.AUDIT_READ,
    available: validAdapter(adapter),
    render,
  });
}

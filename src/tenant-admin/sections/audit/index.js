import { formatDateTime, t } from '../../../core/i18n.js';
import { clear, el } from '../../../core/ui.js';
import {
  TENANT_ADMIN_SECTION_PERMISSION,
  defineTenantAdminSection,
} from '../../section-contract.js';
import {
  renderSectionEmpty,
  renderSectionError,
  renderSectionLoading,
} from '../../section-presentation.js';

function validAdapter(adapter) {
  return adapter !== null && typeof adapter?.listAuditEvents === 'function';
}

export function createAuditSection({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('AUDIT_SECTION_ADAPTER_INVALID');

  async function render({ root, isCurrent }) {
    renderSectionLoading(root, 'tenantAdmin.audit.title');
    try {
      const result = await adapter.listAuditEvents();
      if (!isCurrent()) return;
      const events = Array.isArray(result?.events) ? result.events : [];
      if (!events.length) {
        renderSectionEmpty(root, 'tenantAdmin.audit.title', 'tenantAdmin.audit.description');
        return;
      }
      clear(root);
      const list = el('ol', { className: 'tenant-admin-audit-list' });
      events.forEach((event) => {
        list.appendChild(el('li', { className: 'card' }, [
          el('strong', { text: event.action }),
          el('p', { text: event.outcome }),
          el('small', { text: formatDateTime(event.occurredAt) }),
        ]));
      });
      root.appendChild(el('section', {}, [
        el('h2', {
          text: t('tenantAdmin.audit.title'),
          attrs: { tabindex: '-1' },
        }),
        list,
      ]));
    } catch {
      if (isCurrent()) renderSectionError(root, 'tenantAdmin.audit.title');
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

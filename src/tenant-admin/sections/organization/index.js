import { t } from '../../../core/i18n.js';
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
  return adapter !== null && typeof adapter?.loadOrganization === 'function';
}

export function createOrganizationSection({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('ORGANIZATION_SECTION_ADAPTER_INVALID');

  async function render({ root, isCurrent }) {
    renderSectionLoading(root, 'tenantAdmin.organization.title');
    try {
      const snapshot = await adapter.loadOrganization();
      if (!isCurrent()) return;
      if (!snapshot?.organization) {
        renderSectionEmpty(root, 'tenantAdmin.organization.title', 'tenantAdmin.organization.description');
        return;
      }
      clear(root);
      root.appendChild(el('section', { className: 'card tenant-admin-domain-summary' }, [
        el('h2', {
          text: t('tenantAdmin.organization.title'),
          attrs: { tabindex: '-1' },
        }),
        el('p', { text: snapshot.organization.displayName || t('tenantAdmin.section.empty') }),
        el('p', {
          className: 'muted',
          text: t('tenantAdmin.section.revision', { revision: snapshot.revision }),
        }),
      ]));
    } catch {
      if (isCurrent()) renderSectionError(root, 'tenantAdmin.organization.title');
    }
  }

  return defineTenantAdminSection({
    id: 'organization',
    titleKey: 'tenantAdmin.organization.title',
    descriptionKey: 'tenantAdmin.organization.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.CONFIGURE,
    available: validAdapter(adapter),
    render,
  });
}

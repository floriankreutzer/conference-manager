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
  return adapter !== null && typeof adapter?.loadCapabilities === 'function';
}

export function createCapabilitiesSection({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('CAPABILITIES_SECTION_ADAPTER_INVALID');

  async function render({ root, isCurrent }) {
    renderSectionLoading(root, 'tenantAdmin.capabilities.title');
    try {
      const snapshot = await adapter.loadCapabilities();
      if (!isCurrent()) return;
      const capabilities = Array.isArray(snapshot?.capabilities) ? snapshot.capabilities : [];
      if (!capabilities.length) {
        renderSectionEmpty(root, 'tenantAdmin.capabilities.title', 'tenantAdmin.capabilities.description');
        return;
      }
      clear(root);
      const list = el('ul', { className: 'tenant-admin-capability-list' });
      capabilities.forEach((capability) => {
        list.appendChild(el('li', {}, [
          el('strong', { text: capability.name || capability.id }),
          el('span', { className: 'status-chip', text: capability.state }),
        ]));
      });
      root.appendChild(el('section', { className: 'card tenant-admin-domain-summary' }, [
        el('h2', {
          text: t('tenantAdmin.capabilities.title'),
          attrs: { tabindex: '-1' },
        }),
        list,
      ]));
    } catch {
      if (isCurrent()) renderSectionError(root, 'tenantAdmin.capabilities.title');
    }
  }

  return defineTenantAdminSection({
    id: 'capabilities',
    titleKey: 'tenantAdmin.capabilities.title',
    descriptionKey: 'tenantAdmin.capabilities.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.CONFIGURE,
    available: validAdapter(adapter),
    render,
  });
}

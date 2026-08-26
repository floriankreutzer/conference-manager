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
  return adapter !== null && typeof adapter?.loadLocations === 'function';
}

export function createLocationsSection({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('LOCATIONS_SECTION_ADAPTER_INVALID');

  async function render({ root, isCurrent }) {
    renderSectionLoading(root, 'tenantAdmin.locations.title');
    try {
      const snapshot = await adapter.loadLocations();
      if (!isCurrent()) return;
      const locations = Array.isArray(snapshot?.locations) ? snapshot.locations : [];
      if (!locations.length) {
        renderSectionEmpty(root, 'tenantAdmin.locations.title', 'tenantAdmin.locations.description');
        return;
      }
      clear(root);
      root.appendChild(el('section', { className: 'card tenant-admin-domain-summary' }, [
        el('h2', {
          text: t('tenantAdmin.locations.title'),
          attrs: { tabindex: '-1' },
        }),
        el('p', { text: t('tenantAdmin.locations.count', { count: locations.length }) }),
        el('p', {
          className: 'muted',
          text: t('tenantAdmin.section.revision', { revision: snapshot.revision }),
        }),
      ]));
    } catch {
      if (isCurrent()) renderSectionError(root, 'tenantAdmin.locations.title');
    }
  }

  return defineTenantAdminSection({
    id: 'locations',
    titleKey: 'tenantAdmin.locations.title',
    descriptionKey: 'tenantAdmin.locations.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.CONFIGURE,
    available: validAdapter(adapter),
    render,
  });
}

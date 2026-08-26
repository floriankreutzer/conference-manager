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
  return adapter !== null && typeof adapter?.loadCatalogSettings === 'function';
}

export function createCatalogSection({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('CATALOG_SECTION_ADAPTER_INVALID');

  async function render({ root, isCurrent }) {
    renderSectionLoading(root, 'tenantAdmin.catalog.title');
    try {
      const snapshot = await adapter.loadCatalogSettings();
      if (!isCurrent()) return;
      const serviceCount = Array.isArray(snapshot?.services) ? snapshot.services.length : 0;
      const packageCount = Array.isArray(snapshot?.cateringPackages) ? snapshot.cateringPackages.length : 0;
      const itemCount = Array.isArray(snapshot?.cateringItems) ? snapshot.cateringItems.length : 0;
      if (serviceCount + packageCount + itemCount === 0) {
        renderSectionEmpty(root, 'tenantAdmin.catalog.title', 'tenantAdmin.catalog.description');
        return;
      }
      clear(root);
      root.appendChild(el('section', { className: 'card tenant-admin-domain-summary' }, [
        el('h2', {
          text: t('tenantAdmin.catalog.title'),
          attrs: { tabindex: '-1' },
        }),
        el('p', {
          text: t('tenantAdmin.catalog.counts', {
            services: serviceCount,
            packages: packageCount,
            items: itemCount,
          }),
        }),
        el('p', {
          className: 'muted',
          text: t('tenantAdmin.section.revision', { revision: snapshot.revision }),
        }),
      ]));
    } catch {
      if (isCurrent()) renderSectionError(root, 'tenantAdmin.catalog.title');
    }
  }

  return defineTenantAdminSection({
    id: 'catalog',
    titleKey: 'tenantAdmin.catalog.title',
    descriptionKey: 'tenantAdmin.catalog.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.CONFIGURE,
    available: validAdapter(adapter),
    render,
  });
}

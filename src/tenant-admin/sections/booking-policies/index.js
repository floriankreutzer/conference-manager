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
  return adapter !== null && typeof adapter?.loadBookingPolicies === 'function';
}

export function createBookingPoliciesSection({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('BOOKING_POLICIES_SECTION_ADAPTER_INVALID');

  async function render({ root, isCurrent }) {
    renderSectionLoading(root, 'tenantAdmin.bookingPolicies.title');
    try {
      const snapshot = await adapter.loadBookingPolicies();
      if (!isCurrent()) return;
      if (!snapshot?.policy) {
        renderSectionEmpty(root, 'tenantAdmin.bookingPolicies.title', 'tenantAdmin.bookingPolicies.description');
        return;
      }
      clear(root);
      root.appendChild(el('section', { className: 'card tenant-admin-domain-summary' }, [
        el('h2', {
          text: t('tenantAdmin.bookingPolicies.title'),
          attrs: { tabindex: '-1' },
        }),
        el('p', { text: t('tenantAdmin.bookingPolicies.configured') }),
        el('p', {
          className: 'muted',
          text: t('tenantAdmin.section.revision', { revision: snapshot.revision }),
        }),
      ]));
    } catch {
      if (isCurrent()) renderSectionError(root, 'tenantAdmin.bookingPolicies.title');
    }
  }

  return defineTenantAdminSection({
    id: 'booking-policies',
    titleKey: 'tenantAdmin.bookingPolicies.title',
    descriptionKey: 'tenantAdmin.bookingPolicies.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.CONFIGURE,
    available: validAdapter(adapter),
    render,
  });
}

import { formatDateTime, t } from '../../../core/i18n.js';
import { announce, clear, el } from '../../../core/ui.js';
import {
  TENANT_ADMIN_SECTION_PERMISSION,
  defineTenantAdminSection,
} from '../../section-contract.js';
import {
  renderSectionError,
  renderSectionLoading,
} from '../../section-presentation.js';
import {
  capabilityErrorKey,
  capabilityNameKey,
  capabilityReasonKey,
} from './model.js';

function validAdapter(adapter) {
  return adapter !== null && typeof adapter?.loadCapabilities === 'function';
}

function timestamp(value) {
  return value === null
    ? t('tenantAdmin.operations.common.never')
    : formatDateTime(value);
}

function actionHref(action) {
  return action.id === 'manage_microsoft_connection'
    ? '#tenant-admin/microsoft365'
    : action.href;
}

function capabilityCard(capability) {
  const headingId = `tenant-capability-${capability.id.replaceAll('.', '-')}`;
  const card = el('li', {
    className: 'card tenant-capability-card',
    dataset: { tenantCapabilityId: capability.id, tenantCapabilityState: capability.state },
    attrs: { 'aria-labelledby': headingId },
  }, [
    el('header', { className: 'tenant-capability-card-header' }, [
      el('h3', { id: headingId, text: t(capabilityNameKey(capability.id)) }),
      el('span', {
        className: `status-chip tenant-capability-state-${capability.state}`,
        text: t(`tenantAdmin.operations.capabilities.state.${capability.state}`),
      }),
    ]),
    el('p', {
      className: 'muted',
      text: t(`tenantAdmin.operations.capabilities.availability.${capability.availability}`),
    }),
  ]);
  if (capability.reasonCodes.length > 0) {
    card.appendChild(el('ul', {
      className: 'tenant-capability-reasons',
      attrs: { 'aria-label': t('tenantAdmin.operations.capabilities.reasons') },
    }, capability.reasonCodes.map((reason) => el('li', { text: t(capabilityReasonKey(reason)) }))));
  } else {
    card.appendChild(el('p', {
      className: 'tenant-capability-ready',
      text: t('tenantAdmin.operations.capabilities.noBlockingReasons'),
    }));
  }
  card.appendChild(el('dl', { className: 'tenant-operations-metadata' }, [
    el('dt', { text: t('tenantAdmin.operations.capabilities.lastChecked') }),
    el('dd', { text: timestamp(capability.lastCheckedAt) }),
  ]));
  if (capability.action !== null) {
    card.appendChild(el('a', {
      className: 'secondary tenant-capability-action',
      href: actionHref(capability.action),
      text: t(`tenantAdmin.operations.capabilities.action.${capability.action.id}`),
    }));
  }
  return card;
}

export function createCapabilitiesSection({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('CAPABILITIES_SECTION_ADAPTER_INVALID');

  async function render({ root, isCurrent }) {
    clear(root);
    root.appendChild(el('section', { className: 'card tenant-admin-intro' }, [
      el('h2', { text: t('tenantAdmin.capabilities.title'), attrs: { tabindex: '-1' } }),
      el('p', { text: t('tenantAdmin.capabilities.description') }),
      el('p', { className: 'muted', text: t('tenantAdmin.operations.capabilities.readOnly') }),
    ]));
    const surface = el('section', { dataset: { tenantCapabilities: 'true' } });
    root.appendChild(surface);
    renderSectionLoading(surface, 'tenantAdmin.capabilities.title');
    try {
      const snapshot = await adapter.loadCapabilities();
      if (!isCurrent()) return;
      clear(surface);
      surface.appendChild(el('section', { className: 'card tenant-capability-summary' }, [
        el('h3', { text: t('tenantAdmin.operations.capabilities.summary') }),
        el('dl', { className: 'tenant-operations-metadata' }, [
          el('dt', { text: t('tenantAdmin.operations.capabilities.tenantStatus') }),
          el('dd', { text: t(`tenantAdmin.operations.capabilities.tenantStatus.${snapshot.tenantStatus}`) }),
          el('dt', { text: t('tenantAdmin.operations.capabilities.evaluatedAt') }),
          el('dd', {}, [
            el('time', {
              text: formatDateTime(snapshot.evaluatedAt),
              attrs: { datetime: snapshot.evaluatedAt },
            }),
          ]),
        ]),
      ]));
      const list = el('ul', { className: 'tenant-admin-capability-list tenant-capability-grid' });
      snapshot.capabilities.forEach((capability) => list.appendChild(capabilityCard(capability)));
      surface.appendChild(list);
      announce(t('tenantAdmin.operations.capabilities.loaded'));
    } catch (error) {
      if (!isCurrent()) return;
      const key = capabilityErrorKey(error?.code);
      renderSectionError(surface, 'tenantAdmin.capabilities.title');
      surface.appendChild(el('p', { attrs: { role: 'alert' }, text: t(key) }));
      announce(t(key), { assertive: true });
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

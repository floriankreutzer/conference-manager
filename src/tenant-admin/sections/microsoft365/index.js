import { formatDateTime, formatNumber, t } from '../../../core/i18n.js';
import { announce, button, clear, el } from '../../../core/ui.js';
import { createTenantOnboardingWizard } from '../../onboarding-wizard.js';
import {
  TENANT_ADMIN_SECTION_PERMISSION,
  defineTenantAdminSection,
} from '../../section-contract.js';
import {
  mappingDrift,
  microsoftConnectionReasonKey,
  microsoftHealthReasonKey,
  microsoftOperationsErrorKey,
} from './model.js';

function operationPort(adapter) {
  if (
    typeof adapter?.operations?.getOperations === 'function'
    && typeof adapter?.operations?.synchronizeMappings === 'function'
  ) return adapter.operations;
  if (
    typeof adapter?.connection?.getOperations === 'function'
    && typeof adapter?.connection?.synchronizeMappings === 'function'
  ) return adapter.connection;
  if (
    typeof adapter?.onboardingRuntime?.getOperations === 'function'
    && typeof adapter?.onboardingRuntime?.synchronizeMappings === 'function'
  ) return adapter.onboardingRuntime;
  return null;
}

function validAdapter(adapter) {
  if (adapter === null) return false;
  const connection = adapter?.connection || null;
  const onboardingRuntime = adapter?.onboardingRuntime || null;
  const connectionValid = connection === null || (
    typeof connection.getStatus === 'function'
    && typeof connection.connect === 'function'
    && typeof connection.verify === 'function'
    && typeof connection.disconnect === 'function'
  );
  return connectionValid
    && (connection !== null || onboardingRuntime !== null)
    && operationPort(adapter) !== null;
}

function timestamp(value) {
  return value === null
    ? t('tenantAdmin.operations.common.never')
    : formatDateTime(value);
}

function healthCard(id, value) {
  const headingId = `tenant-microsoft365-health-${id}`;
  const card = el('article', {
    className: 'card tenant-microsoft365-health-card',
    dataset: { microsoft365Health: id, microsoft365HealthStatus: value.status },
    attrs: { 'aria-labelledby': headingId },
  }, [
    el('header', { className: 'tenant-operation-card-header' }, [
      el('h4', { id: headingId, text: t(`tenantAdmin.operations.microsoft365.health.${id}`) }),
      el('span', {
        className: `status-chip tenant-microsoft365-health-${value.status}`,
        text: t(`tenantAdmin.operations.microsoft365.healthState.${value.status}`),
      }),
    ]),
    value.reason === null
      ? el('p', { className: 'tenant-operation-success', text: t('tenantAdmin.operations.microsoft365.noReason') })
      : el('p', { text: t(microsoftHealthReasonKey(value.reason)) }),
    el('dl', { className: 'tenant-operations-metadata' }, [
      el('dt', { text: t('tenantAdmin.operations.microsoft365.lastChecked') }),
      el('dd', { text: timestamp(value.lastCheckedAt) }),
      el('dt', { text: t('tenantAdmin.operations.microsoft365.lastSuccess') }),
      el('dd', { text: timestamp(value.lastSuccessAt) }),
    ]),
  ]);
  return card;
}

function readinessSummary(snapshot) {
  const connectionReady = snapshot.readiness.checks.tenantIdentityClaimed
    && snapshot.readiness.checks.microsoft365Connected;
  const directoryReady = connectionReady
    && snapshot.readiness.entitlements.microsoftDirectory
    && snapshot.readiness.checks.placesPermissionGranted;
  const freeBusyReady = connectionReady
    && snapshot.readiness.entitlements.microsoftCalendar
    && snapshot.readiness.checks.calendarPermissionGranted
    && snapshot.readiness.checks.freeBusyVerified;
  const calendarWriteReady = connectionReady
    && snapshot.readiness.entitlements.microsoftCalendarWrite
    && snapshot.readiness.checks.calendarPermissionGranted
    && snapshot.connection.health.calendarWrite.status === 'healthy';
  const values = [
    ['directory', directoryReady, snapshot.readiness.entitlements.microsoftDirectory],
    ['freeBusy', freeBusyReady, snapshot.readiness.entitlements.microsoftCalendar],
    ['calendarWrite', calendarWriteReady, snapshot.readiness.entitlements.microsoftCalendarWrite],
  ];
  const list = el('ul', { className: 'tenant-microsoft365-readiness-list' });
  values.forEach(([id, ready, entitled]) => {
    list.appendChild(el('li', {}, [
      el('strong', { text: t(`tenantAdmin.operations.microsoft365.readiness.${id}`) }),
      el('span', {
        className: `status-chip ${ready ? 'is-ready' : 'is-blocked'}`,
        text: t(entitled
          ? (ready
            ? 'tenantAdmin.operations.microsoft365.readiness.ready'
            : 'tenantAdmin.operations.microsoft365.readiness.blocked')
          : 'tenantAdmin.operations.microsoft365.readiness.notEntitled'),
      }),
    ]));
  });
  return el('section', { className: 'card tenant-microsoft365-readiness' }, [
    el('h3', { text: t('tenantAdmin.operations.microsoft365.readiness.title') }),
    el('p', { text: t('tenantAdmin.operations.microsoft365.readiness.separation') }),
    list,
  ]);
}

function mappingCard(mapping) {
  const drift = mappingDrift(mapping);
  const headingId = `tenant-microsoft365-mapping-${mapping.roomId}`;
  const card = el('li', {
    className: 'card tenant-microsoft365-mapping-card',
    dataset: {
      microsoft365Mapping: mapping.roomId,
      microsoft365MappingStatus: mapping.providerStatus,
    },
    attrs: { 'aria-labelledby': headingId },
  }, [
    el('header', { className: 'tenant-operation-card-header' }, [
      el('h4', { id: headingId, text: mapping.localRoom.name }),
      el('span', {
        className: `status-chip tenant-microsoft365-mapping-${mapping.providerStatus}`,
        text: t(`tenantAdmin.operations.microsoft365.mappingStatus.${mapping.providerStatus}`),
      }),
    ]),
    el('dl', { className: 'tenant-operations-metadata' }, [
      el('dt', { text: t('tenantAdmin.operations.microsoft365.mapping.localName') }),
      el('dd', { text: mapping.localRoom.name }),
      el('dt', { text: t('tenantAdmin.operations.microsoft365.mapping.providerName') }),
      el('dd', { text: mapping.providerName }),
      el('dt', { text: t('tenantAdmin.operations.microsoft365.mapping.localCapacity') }),
      el('dd', { text: formatNumber(mapping.localRoom.capacity) }),
      el('dt', { text: t('tenantAdmin.operations.microsoft365.mapping.providerCapacity') }),
      el('dd', {
        text: mapping.providerCapacity === null
          ? t('tenantAdmin.operations.common.notAvailable')
          : formatNumber(mapping.providerCapacity),
      }),
      el('dt', { text: t('tenantAdmin.operations.microsoft365.mapping.lastSeen') }),
      el('dd', { text: timestamp(mapping.lastSeenAt) }),
    ]),
  ]);
  const reasons = [];
  if (drift.missing) reasons.push('tenantAdmin.operations.microsoft365.drift.missing');
  if (drift.name) reasons.push('tenantAdmin.operations.microsoft365.drift.name');
  if (drift.capacity) reasons.push('tenantAdmin.operations.microsoft365.drift.capacity');
  card.appendChild(reasons.length > 0
    ? el('ul', {
      className: 'tenant-microsoft365-drift-list',
      attrs: { 'aria-label': t('tenantAdmin.operations.microsoft365.drift.title') },
    }, reasons.map((key) => el('li', { text: t(key) })))
    : el('p', { className: 'tenant-operation-success', text: t('tenantAdmin.operations.microsoft365.drift.none') }));
  return card;
}

export function createMicrosoft365Section({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('MICROSOFT365_SECTION_ADAPTER_INVALID');
  const connection = adapter?.connection || null;
  const operations = operationPort(adapter);
  const onboarding = adapter?.onboardingRuntime
    ? createTenantOnboardingWizard({ runtime: adapter.onboardingRuntime })
    : null;
  let pendingOperationsFocus = null;
  let pendingSynchronizationCount = null;

  async function loadConnection(root, isCurrent, rerender) {
    if (!connection) return;
    const surface = root.querySelector('[data-microsoft365-connection]');
    if (!surface) return;
    try {
      const state = await connection.getStatus();
      if (!isCurrent()) return;
      clear(surface);
      const status = el('p', {
        className: 'status-chip',
        text: t(`tenantAdmin.microsoft365.state.${state.state}`),
        attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
      });
      const message = el('p', {
        className: 'field-hint',
        attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
      });
      surface.append(
        status,
        el('ul', {}, [
          el('li', {
            text: t('tenantAdmin.microsoft365.permission.places', {
              state: t(`tenantAdmin.microsoft365.permissionState.${state.permissions.place}`),
            }),
          }),
          el('li', {
            text: t('tenantAdmin.microsoft365.permission.calendars', {
              state: t(`tenantAdmin.microsoft365.permissionState.${state.permissions.calendars}`),
            }),
          }),
        ]),
      );

      const actions = el('div', { className: 'button-row' });
      let mutationPending = false;
      const setPending = (pending) => {
        mutationPending = pending;
        actions.querySelectorAll('button').forEach((actionButton) => {
          actionButton.disabled = pending;
        });
      };
      const runMutation = async (operation, onSuccess) => {
        if (mutationPending) return;
        message.textContent = '';
        setPending(true);
        try {
          const result = await operation();
          if (!isCurrent()) return;
          await onSuccess(result);
        } catch {
          if (!isCurrent()) return;
          message.textContent = t('tenantAdmin.microsoft365.error');
          announce(message.textContent, { assertive: true });
          setPending(false);
        }
      };

      const connect = button(
        t(state.state === 'disconnected' ? 'tenantAdmin.microsoft365.connect' : 'tenantAdmin.microsoft365.reconnect'),
        { className: 'primary' },
      );
      connect.addEventListener('click', () => {
        void runMutation(
          () => connection.connect(),
          ({ authorizationUrl }) => globalThis.location.assign(authorizationUrl),
        );
      });
      actions.appendChild(connect);

      if (state.state !== 'disconnected') {
        const verify = button(t('tenantAdmin.microsoft365.verify'));
        verify.addEventListener('click', () => {
          void runMutation(() => connection.verify(), () => rerender());
        });
        const disconnect = button(t('tenantAdmin.microsoft365.disconnect'));
        disconnect.setAttribute('aria-describedby', 'tenant-microsoft365-disconnect-warning');
        disconnect.addEventListener('click', () => {
          void runMutation(() => connection.disconnect(), () => rerender());
        });
        actions.append(verify, disconnect);
      }
      surface.append(actions, message);
    } catch {
      if (!isCurrent()) return;
      clear(surface);
      surface.appendChild(el('p', {
        attrs: { role: 'alert' },
        text: t('tenantAdmin.microsoft365.error'),
      }));
    }
  }

  async function loadOperations(root, isCurrent, rerender) {
    const surface = root.querySelector('[data-microsoft365-operations-surface]');
    if (!surface || !operations) return;
    try {
      const snapshot = await operations.getOperations();
      if (!isCurrent()) return;
      const synchronizedCount = pendingSynchronizationCount;
      pendingSynchronizationCount = null;
      clear(surface);
      surface.appendChild(el('section', { className: 'card tenant-microsoft365-connection-summary' }, [
        el('header', { className: 'tenant-operation-card-header' }, [
          el('h3', { text: t('tenantAdmin.operations.microsoft365.statusTitle') }),
          el('span', {
            className: 'status-chip',
            text: t(`tenantAdmin.microsoft365.state.${snapshot.connection.state}`),
          }),
        ]),
        snapshot.connection.reason === null
          ? null
          : el('p', { text: t(microsoftConnectionReasonKey(snapshot.connection.reason)) }),
        el('dl', { className: 'tenant-operations-metadata' }, [
          el('dt', { text: t('tenantAdmin.operations.microsoft365.lastVerified') }),
          el('dd', { text: timestamp(snapshot.connection.lastVerifiedAt) }),
          el('dt', { text: t('tenantAdmin.operations.microsoft365.placesPermission') }),
          el('dd', { text: t(`tenantAdmin.microsoft365.permissionState.${snapshot.connection.permissions.place}`) }),
          el('dt', { text: t('tenantAdmin.operations.microsoft365.calendarReadPermission') }),
          el('dd', { text: t(`tenantAdmin.microsoft365.permissionState.${snapshot.connection.permissions.calendars}`) }),
        ]),
        el('p', {
          id: 'tenant-microsoft365-disconnect-warning',
          className: 'tenant-operation-warning',
          text: t('tenantAdmin.operations.microsoft365.disconnectWarning'),
        }),
        el('p', {
          className: 'muted',
          text: t('tenantAdmin.operations.microsoft365.reconnectWarning'),
        }),
      ]));

      surface.appendChild(readinessSummary(snapshot));
      surface.appendChild(el('section', { className: 'tenant-microsoft365-health' }, [
        el('h3', { text: t('tenantAdmin.operations.microsoft365.healthTitle') }),
        el('div', { className: 'tenant-microsoft365-health-grid' }, [
          healthCard('places', snapshot.connection.health.places),
          healthCard('freeBusy', snapshot.connection.health.freeBusy),
          healthCard('calendarWrite', snapshot.connection.health.calendarWrite),
        ]),
      ]));

      const mappingSection = el('section', { className: 'tenant-microsoft365-inventory' }, [
        el('h3', { text: t('tenantAdmin.operations.microsoft365.inventoryTitle') }),
        el('p', { text: t('tenantAdmin.operations.microsoft365.inventoryDescription') }),
      ]);
      const mutationStatus = el('p', {
        className: 'field-hint',
        attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
        text: synchronizedCount === null
          ? ''
          : t('tenantAdmin.operations.microsoft365.resynced', {
            count: formatNumber(synchronizedCount),
          }),
      });
      const resync = button(t('tenantAdmin.operations.microsoft365.resync'), {
        className: 'primary',
        dataset: { microsoft365Resync: 'true' },
        disabled: !['connected', 'degraded'].includes(snapshot.connection.state),
      });
      resync.addEventListener('click', async () => {
        resync.disabled = true;
        mutationStatus.textContent = t('tenantAdmin.operations.microsoft365.resyncing');
        try {
          const mappings = await operations.synchronizeMappings();
          if (!isCurrent()) return;
          pendingSynchronizationCount = mappings.length;
          pendingOperationsFocus = 'resync';
          rerender();
        } catch (error) {
          if (!isCurrent()) return;
          const key = microsoftOperationsErrorKey(error?.code, 'sync');
          mutationStatus.textContent = t(key);
          announce(t(key), { assertive: true });
          resync.disabled = false;
          resync.focus();
        }
      });
      mappingSection.append(
        el('p', { className: 'muted', text: t('tenantAdmin.operations.microsoft365.resyncWarning') }),
        el('div', { className: 'button-row' }, [resync]),
        mutationStatus,
      );
      if (snapshot.mappings.length === 0) {
        mappingSection.appendChild(el('p', {
          className: 'card tenant-admin-status',
          text: t('tenantAdmin.operations.microsoft365.inventoryEmpty'),
        }));
      } else {
        const list = el('ul', { className: 'tenant-microsoft365-mapping-grid' });
        snapshot.mappings.forEach((mapping) => list.appendChild(mappingCard(mapping)));
        mappingSection.appendChild(list);
      }
      surface.appendChild(mappingSection);
      announce(synchronizedCount === null
        ? t('tenantAdmin.operations.microsoft365.loaded')
        : mutationStatus.textContent);
      const focusTarget = pendingOperationsFocus;
      pendingOperationsFocus = null;
      if (focusTarget !== null) {
        requestAnimationFrame(() => root.querySelector(
          focusTarget === 'refresh'
            ? '[data-microsoft365-refresh]'
            : '[data-microsoft365-resync]',
        )?.focus());
      }
    } catch (error) {
      if (!isCurrent()) return;
      clear(surface);
      const key = microsoftOperationsErrorKey(error?.code);
      const retry = button(t('tenantAdmin.operations.common.retry'), { className: 'primary' });
      retry.addEventListener('click', rerender);
      surface.appendChild(el('section', { className: 'card tenant-admin-status', attrs: { role: 'alert' } }, [
        el('h3', { text: t('tenantAdmin.operations.microsoft365.errorTitle') }),
        el('p', { text: t(key) }),
        retry,
      ]));
      announce(t(key), { assertive: true });
    }
  }

  async function render({ root, isCurrent, rerender }) {
    clear(root);
    root.appendChild(el('section', { className: 'card tenant-admin-intro' }, [
      el('h2', {
        text: t('tenantAdmin.microsoft365.title'),
        attrs: { tabindex: '-1' },
      }),
      el('p', { text: t('tenantAdmin.microsoft365.description') }),
    ]));

    if (onboarding) {
      const onboardingRoot = el('section', {
        className: 'tenant-onboarding',
        dataset: { tenantOnboarding: 'true' },
        attrs: { 'aria-label': t('tenantAdmin.onboarding.title') },
      });
      root.appendChild(onboardingRoot);
      await onboarding.renderInto(onboardingRoot);
      if (!isCurrent()) return;
    } else if (connection) {
      root.appendChild(el('section', { className: 'card tenant-admin-intro' }, [
        el('h3', { text: t('tenantAdmin.microsoft365.connectionTitle') }),
        el('div', { dataset: { microsoft365Connection: 'true' } }, [
          el('p', {
            attrs: { role: 'status', 'aria-live': 'polite' },
            text: t('tenantAdmin.microsoft365.loading'),
          }),
        ]),
      ]));
      await loadConnection(root, isCurrent, rerender);
      if (!isCurrent()) return;
    }

    const refreshOperations = button(t('tenantAdmin.operations.common.refresh'), {
      dataset: { microsoft365Refresh: 'true' },
      attrs: { 'aria-label': t('tenantAdmin.operations.microsoft365.refresh') },
    });
    refreshOperations.addEventListener('click', () => {
      pendingOperationsFocus = 'refresh';
      rerender();
    });
    root.appendChild(el('section', {
      className: 'tenant-microsoft365-operations',
      dataset: { microsoft365Operations: 'true' },
      attrs: { 'aria-label': t('tenantAdmin.operations.microsoft365.title') },
    }, [
      el('div', { className: 'tenant-operation-section-header' }, [
        el('h2', { text: t('tenantAdmin.operations.microsoft365.title'), attrs: { tabindex: '-1' } }),
        refreshOperations,
      ]),
      el('p', { text: t('tenantAdmin.operations.microsoft365.description') }),
      el('div', { dataset: { microsoft365OperationsSurface: 'true' } }, [
        el('p', {
          attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
          text: t('tenantAdmin.operations.microsoft365.loading'),
        }),
      ]),
    ]));
    await loadOperations(root, isCurrent, rerender);
  }

  return defineTenantAdminSection({
    id: 'microsoft365',
    titleKey: 'tenantAdmin.microsoft365.title',
    descriptionKey: 'tenantAdmin.microsoft365.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.INTEGRATIONS_MANAGE,
    available: validAdapter(adapter),
    render,
  });
}

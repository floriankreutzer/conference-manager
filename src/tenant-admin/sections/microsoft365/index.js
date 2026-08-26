import { t } from '../../../core/i18n.js';
import { announce, button, clear, el } from '../../../core/ui.js';
import { createTenantOnboardingWizard } from '../../onboarding-wizard.js';
import {
  TENANT_ADMIN_SECTION_PERMISSION,
  defineTenantAdminSection,
} from '../../section-contract.js';

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
  return connectionValid && (connection !== null || onboardingRuntime !== null);
}

export function createMicrosoft365Section({ adapter = null } = {}) {
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('MICROSOFT365_SECTION_ADAPTER_INVALID');
  const connection = adapter?.connection || null;
  const onboarding = adapter?.onboardingRuntime
    ? createTenantOnboardingWizard({
      onboardingRuntime: adapter.onboardingRuntime,
      runtime: adapter.onboardingRuntime,
    })
    : null;

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
    }

    if (connection) {
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
    }
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

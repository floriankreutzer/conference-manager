import { t } from '../core/i18n.js';
import { announce, button, clear, el, showToast } from '../core/ui.js';
import { createTenantOnboardingWizard } from './onboarding-wizard.js';
import {
  TENANT_ELEVATED_ROLE,
  canSelectRole,
  elevatedRolesFromUser,
  roleUpdateErrorKey,
  sameRoleSelection,
} from './user-role-model.js';

function checkbox({ id, label, checked, disabled, describedBy }) {
  const control = el('input', {
    type: 'checkbox',
    checked,
    disabled,
    attrs: describedBy ? { 'aria-describedby': describedBy } : {},
  });
  control.id = id;
  return {
    control,
    wrapper: el('label', { className: 'tenant-role-option' }, [control, el('span', { text: label })]),
  };
}

function userStatus(user) {
  return user.active ? t('tenantAdmin.users.active') : t('tenantAdmin.users.inactive');
}

function currentSelection(controls) {
  return [
    controls.conferenceManager.checked ? TENANT_ELEVATED_ROLE.CONFERENCE_MANAGER : null,
    controls.tenantAdmin.checked ? TENANT_ELEVATED_ROLE.TENANT_ADMIN : null,
  ].filter(Boolean);
}

export function createTenantAdminApplication({
  context,
  appRoot,
  setPageHeading,
  userAdministration,
  microsoft365Connection,
  onboardingRuntime,
} = {}) {
  if (!context || typeof context.isTenantAdmin !== 'function') throw new TypeError('TENANT_ADMIN_CONTEXT_REQUIRED');
  if (!(appRoot instanceof HTMLElement)) throw new TypeError('TENANT_ADMIN_ROOT_REQUIRED');
  if (typeof setPageHeading !== 'function') throw new TypeError('TENANT_ADMIN_HEADING_REQUIRED');
  if (!userAdministration || typeof userAdministration.listUsers !== 'function' || typeof userAdministration.setRoles !== 'function') {
    throw new TypeError('TENANT_USER_ADMINISTRATION_REQUIRED');
  }

  let generation = 0;
  let pendingFocusUserId = null;
  const onboarding = onboardingRuntime
    ? createTenantOnboardingWizard({ onboardingRuntime, runtime: onboardingRuntime })
    : null;

  function loadingPanel() {
    return el('section', {
      className: 'card tenant-admin-status',
      attrs: { role: 'status', 'aria-live': 'polite' },
    }, [
      el('strong', { text: t('tenantAdmin.users.loading') }),
      context.isDemoRuntime() ? null : el('p', { className: 'muted', text: t('tenantAdmin.users.loadingHint') }),
    ]);
  }

  function errorPanel(messageKey, retry) {
    const panel = el('section', {
      className: 'card tenant-admin-status',
      attrs: { role: 'alert' },
    }, [
      el('strong', { text: t('tenantAdmin.users.loadError') }),
      el('p', { text: t(messageKey) }),
    ]);
    const retryButton = button(t('tenantAdmin.users.retry'), { className: 'primary' });
    retryButton.addEventListener('click', retry);
    panel.appendChild(retryButton);
    return panel;
  }

  function userCard(user, rerender) {
    const self = user.id === context.userId();
    const originalRoles = elevatedRolesFromUser(user);
    const statusId = `tenant-user-status-${user.id}`;
    const headingId = `tenant-user-heading-${user.id}`;
    const card = el('article', {
      className: 'card tenant-user-card',
      dataset: { tenantUserId: user.id },
      attrs: { 'aria-labelledby': headingId, tabindex: '-1' },
    });
    const header = el('header', { className: 'tenant-user-card-header' }, [
      el('div', {}, [
        el('h3', { id: headingId, text: user.displayName }),
        el('p', { id: statusId, className: 'muted', text: userStatus(user) }),
      ]),
      self ? el('span', { className: 'status-chip', text: t('tenantAdmin.users.you') }) : null,
    ]);

    const baseline = el('p', { className: 'tenant-user-baseline', text: t('tenantAdmin.users.employeeBaseline') });
    const roles = el('fieldset', {
      className: 'tenant-role-fieldset',
      attrs: { 'aria-describedby': statusId },
    });
    roles.disabled = self;
    roles.appendChild(el('legend', { text: t('tenantAdmin.users.elevatedRoles') }));

    const conferenceManager = checkbox({
      id: `tenant-user-manager-${user.id}`,
      label: t('tenantAdmin.users.roleConferenceManager'),
      checked: originalRoles.includes(TENANT_ELEVATED_ROLE.CONFERENCE_MANAGER),
      disabled: self || !canSelectRole(user, TENANT_ELEVATED_ROLE.CONFERENCE_MANAGER),
      describedBy: statusId,
    });
    const tenantAdmin = checkbox({
      id: `tenant-user-admin-${user.id}`,
      label: t('tenantAdmin.users.roleTenantAdmin'),
      checked: originalRoles.includes(TENANT_ELEVATED_ROLE.TENANT_ADMIN),
      disabled: self || !canSelectRole(user, TENANT_ELEVATED_ROLE.TENANT_ADMIN),
      describedBy: statusId,
    });
    roles.append(conferenceManager.wrapper, tenantAdmin.wrapper);

    const message = el('p', { className: 'field-hint tenant-user-message', attrs: { 'aria-live': 'polite' } });
    if (self) message.textContent = t('tenantAdmin.users.selfManagedElsewhere');
    else if (!user.active) message.textContent = t('tenantAdmin.users.inactiveHint');

    const save = button(t('common.save'), {
      className: 'primary',
      disabled: true,
      dataset: { tenantRoleAction: 'save' },
    });
    if (self) save.hidden = true;
    const controls = {
      conferenceManager: conferenceManager.control,
      tenantAdmin: tenantAdmin.control,
    };
    const updateSaveState = () => {
      save.disabled = sameRoleSelection(originalRoles, currentSelection(controls));
      message.textContent = !user.active
        ? t('tenantAdmin.users.inactiveHint')
        : (self ? t('tenantAdmin.users.selfManagedElsewhere') : '');
    };
    Object.values(controls).forEach((control) => control.addEventListener('change', updateSaveState));

    save.addEventListener('click', async () => {
      save.disabled = true;
      Object.values(controls).forEach((control) => { control.disabled = true; });
      message.textContent = t('tenantAdmin.users.saving');
      try {
        const updated = await userAdministration.setRoles(user.id, currentSelection(controls));
        showToast(t('tenantAdmin.users.saved'));
        announce(t('tenantAdmin.users.savedFor', { name: updated.displayName }));
        pendingFocusUserId = updated.id;
        rerender();
      } catch (error) {
        const key = roleUpdateErrorKey(error?.code);
        Object.values(controls).forEach((control) => {
          const role = control === controls.conferenceManager
            ? TENANT_ELEVATED_ROLE.CONFERENCE_MANAGER
            : TENANT_ELEVATED_ROLE.TENANT_ADMIN;
          control.disabled = !canSelectRole(user, role);
        });
        save.disabled = sameRoleSelection(originalRoles, currentSelection(controls));
        message.textContent = t(key);
        announce(t(key), { assertive: true });
        save.focus();
      }
    });

    const actions = el('div', { className: 'button-row tenant-user-actions' }, [save]);
    card.append(header, baseline, roles, message, actions);
    return card;
  }

  async function loadUsers(targetGeneration) {
    try {
      const users = await userAdministration.listUsers();
      if (targetGeneration !== generation) return;
      const surface = appRoot.querySelector('[data-tenant-admin-users]');
      if (!surface) return;
      clear(surface);
      if (!users.length) {
        surface.appendChild(el('section', { className: 'card tenant-admin-status' }, [
          el('strong', { text: t('tenantAdmin.users.empty') }),
          el('p', { className: 'muted', text: t('tenantAdmin.users.emptyHint') }),
        ]));
        return;
      }
      const list = el('div', { className: 'tenant-user-grid' });
      users.forEach((user) => list.appendChild(userCard(user, () => render())));
      surface.appendChild(list);
      announce(t('tenantAdmin.users.loaded', { count: users.length }));
      if (pendingFocusUserId) {
        const focusUserId = pendingFocusUserId;
        pendingFocusUserId = null;
        requestAnimationFrame(() => {
          [...list.children]
            .find((card) => card.dataset.tenantUserId === focusUserId)
            ?.focus();
        });
      }
    } catch (error) {
      if (targetGeneration !== generation) return;
      const surface = appRoot.querySelector('[data-tenant-admin-users]');
      if (!surface) return;
      clear(surface);
      const key = roleUpdateErrorKey(error?.code);
      surface.appendChild(errorPanel(key, () => render()));
      announce(t(key), { assertive: true });
    }
  }

  async function loadMicrosoft365(targetGeneration) {
    const surface = appRoot.querySelector('[data-microsoft365-connection]');
    if (!surface || !microsoft365Connection) return;
    try {
      const connection = await microsoft365Connection.getStatus();
      if (targetGeneration !== generation) return;
      clear(surface);
      const status = el('p', {
        className: 'status-chip',
        text: t(`tenantAdmin.microsoft365.state.${connection.state}`),
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
              state: t(`tenantAdmin.microsoft365.permissionState.${connection.permissions.place}`),
            }),
          }),
          el('li', {
            text: t('tenantAdmin.microsoft365.permission.calendars', {
              state: t(`tenantAdmin.microsoft365.permissionState.${connection.permissions.calendars}`),
            }),
          }),
        ]),
      );

      const actions = el('div', { className: 'button-row' });
      let mutationPending = false;
      const setLifecyclePending = (pending) => {
        mutationPending = pending;
        actions.querySelectorAll('button').forEach((actionButton) => {
          actionButton.disabled = pending;
        });
      };
      const showLifecycleError = () => {
        const errorText = t('tenantAdmin.microsoft365.error');
        message.textContent = errorText;
        announce(errorText, { assertive: true });
      };
      const runLifecycleMutation = async (operation, onSuccess) => {
        if (mutationPending) return;
        message.textContent = '';
        setLifecyclePending(true);
        try {
          const result = await operation();
          if (targetGeneration !== generation) return;
          await onSuccess(result);
        } catch {
          if (targetGeneration !== generation) return;
          showLifecycleError();
          setLifecyclePending(false);
        }
      };

      const connect = button(
        t(connection.state === 'disconnected' ? 'tenantAdmin.microsoft365.connect' : 'tenantAdmin.microsoft365.reconnect'),
        { className: 'primary' },
      );
      connect.addEventListener('click', () => {
        void runLifecycleMutation(
          () => microsoft365Connection.connect(),
          ({ authorizationUrl }) => globalThis.location.assign(authorizationUrl),
        );
      });
      actions.appendChild(connect);

      if (connection.state !== 'disconnected') {
        const verify = button(t('tenantAdmin.microsoft365.verify'));
        verify.addEventListener('click', () => {
          void runLifecycleMutation(
            () => microsoft365Connection.verify(),
            () => render(),
          );
        });
        const disconnect = button(t('tenantAdmin.microsoft365.disconnect'));
        disconnect.addEventListener('click', () => {
          void runLifecycleMutation(
            () => microsoft365Connection.disconnect(),
            () => render(),
          );
        });
        actions.append(verify, disconnect);
      }
      surface.append(actions, message);
    } catch {
      if (targetGeneration !== generation) return;
      clear(surface);
      surface.appendChild(el('p', {
        attrs: { role: 'alert' },
        text: t('tenantAdmin.microsoft365.error'),
      }));
    }
  }

  function microsoft365Panel() {
    return el('section', { className: 'card tenant-admin-intro' }, [
      el('h2', { text: t('tenantAdmin.microsoft365.title') }),
      el('p', { text: t('tenantAdmin.microsoft365.description') }),
      el('div', { dataset: { microsoft365Connection: 'true' } }, [
        el('p', {
          attrs: { role: 'status', 'aria-live': 'polite' },
          text: t('tenantAdmin.microsoft365.loading'),
        }),
      ]),
    ]);
  }

  function render() {
    generation += 1;
    const currentGeneration = generation;
    setPageHeading(t('tenantAdmin.title'), t('tenantAdmin.subtitle'));
    clear(appRoot);

    if (onboarding) {
      const onboardingRoot = el('section', {
        className: 'tenant-onboarding',
        dataset: { tenantOnboarding: 'true' },
        attrs: { 'aria-label': t('tenantAdmin.onboarding.title') },
      });
      appRoot.appendChild(onboardingRoot);
      void onboarding.renderInto(onboardingRoot);
    } else if (microsoft365Connection) {
      appRoot.appendChild(microsoft365Panel());
      void loadMicrosoft365(currentGeneration);
    }

    const intro = el('section', { className: 'card tenant-admin-intro' }, [
      el('h2', { text: t('tenantAdmin.users.title') }),
      el('p', { text: t('tenantAdmin.users.description') }),
      context.isDemoRuntime() ? null : el('p', { className: 'muted', text: t('tenantAdmin.users.securityNote') }),
    ]);
    const refresh = button(t('tenantAdmin.users.refresh'), { dataset: { tenantRoleAction: 'refresh' } });
    refresh.addEventListener('click', render);
    intro.appendChild(el('div', { className: 'button-row' }, [refresh]));

    const users = el('section', {
      dataset: { tenantAdminUsers: 'true' },
      attrs: { 'aria-label': t('tenantAdmin.users.title') },
    }, [loadingPanel()]);
    appRoot.append(intro, users);
    void loadUsers(currentGeneration);
  }

  return Object.freeze({ render });
}

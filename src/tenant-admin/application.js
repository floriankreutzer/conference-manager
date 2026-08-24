import { t } from '../core/i18n.js';
import { announce, button, clear, el, showToast } from '../core/ui.js';
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
} = {}) {
  if (!context || typeof context.isTenantAdmin !== 'function') throw new TypeError('TENANT_ADMIN_CONTEXT_REQUIRED');
  if (!(appRoot instanceof HTMLElement)) throw new TypeError('TENANT_ADMIN_ROOT_REQUIRED');
  if (typeof setPageHeading !== 'function') throw new TypeError('TENANT_ADMIN_HEADING_REQUIRED');
  if (!userAdministration || typeof userAdministration.listUsers !== 'function' || typeof userAdministration.setRoles !== 'function') {
    throw new TypeError('TENANT_USER_ADMINISTRATION_REQUIRED');
  }

  let generation = 0;

  function loadingPanel() {
    return el('section', {
      className: 'card tenant-admin-status',
      attrs: { role: 'status', 'aria-live': 'polite' },
    }, [
      el('strong', { text: t('tenantAdmin.users.loading') }),
      el('p', { className: 'muted', text: t('tenantAdmin.users.loadingHint') }),
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
      attrs: { 'aria-labelledby': headingId },
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

  function render() {
    generation += 1;
    const currentGeneration = generation;
    setPageHeading(t('tenantAdmin.title'), t('tenantAdmin.subtitle'));
    clear(appRoot);
    const intro = el('section', { className: 'card tenant-admin-intro' }, [
      el('h2', { text: t('tenantAdmin.users.title') }),
      el('p', { text: t('tenantAdmin.users.description') }),
      el('p', { className: 'muted', text: t('tenantAdmin.users.securityNote') }),
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

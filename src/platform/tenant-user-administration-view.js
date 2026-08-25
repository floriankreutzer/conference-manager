import { t } from '../core/i18n.js';
import { button, clear, el, showToast } from '../core/ui.js';
import {
  TenantUserAdministrationError,
  createTenantUserAdministrationService,
} from './tenant-user-administration.js';

const ELEVATED_ROLES = Object.freeze([
  Object.freeze({ id: 'conference_manager', labelKey: 'tenantUsers.role.conferenceManager', hintKey: 'tenantUsers.role.conferenceManagerHint' }),
  Object.freeze({ id: 'tenant_admin', labelKey: 'tenantUsers.role.tenantAdmin', hintKey: 'tenantUsers.role.tenantAdminHint' }),
]);

function errorMessageKey(error) {
  const apiCode = error?.cause?.code;
  if (apiCode === 'HTTP_401') return 'tenantUsers.error.session';
  if (apiCode === 'HTTP_403') return 'tenantUsers.error.forbidden';
  if (apiCode === 'HTTP_404') return 'tenantUsers.error.notFound';
  if (apiCode === 'HTTP_409') return 'tenantUsers.error.conflict';
  if (error instanceof TenantUserAdministrationError && error.code.endsWith('_INVALID')) {
    return 'tenantUsers.error.invalidResponse';
  }
  return 'tenantUsers.error.generic';
}

function elevatedRoles(user) {
  return ELEVATED_ROLES.map(({ id }) => id).filter((role) => user.roles.includes(role));
}

function sameRoles(left, right) {
  return left.length === right.length && left.every((role, index) => role === right[index]);
}

function checkedRoles(checkboxes) {
  return ELEVATED_ROLES
    .filter(({ id }) => checkboxes.get(id)?.checked)
    .map(({ id }) => id);
}

export function createTenantUserAdministrationView({ apiClient, appRoot, setPageHeading } = {}) {
  if (!appRoot || typeof appRoot.appendChild !== 'function') throw new TypeError('APP_ROOT_REQUIRED');
  if (typeof setPageHeading !== 'function') throw new TypeError('PAGE_HEADING_REQUIRED');
  const service = apiClient ? createTenantUserAdministrationService({ apiClient }) : null;
  let generation = 0;
  let users = [];
  let nextAfterId = null;
  let listRoot = null;
  let statusRoot = null;
  let loadMoreButton = null;

  function announce(key) {
    if (statusRoot) statusRoot.textContent = t(key);
  }

  function replaceUser(nextUser) {
    users = users.map((user) => user.id === nextUser.id ? nextUser : user);
  }

  function roleControl(user, role, checkboxes, saveButton) {
    const inputId = `tenant-user-${user.id}-${role.id}`;
    const checkbox = el('input', {
      id: inputId,
      type: 'checkbox',
      checked: user.roles.includes(role.id),
    });
    checkboxes.set(role.id, checkbox);
    checkbox.addEventListener('change', () => {
      saveButton.disabled = sameRoles(checkedRoles(checkboxes), elevatedRoles(user));
    });
    return el('div', { className: 'field' }, [
      el('label', { for: inputId }, [checkbox, el('span', { text: t(role.labelKey) })]),
      el('small', { className: 'hint', text: t(role.hintKey) }),
    ]);
  }

  function userCard(user) {
    const checkboxes = new Map();
    const saveButton = button(t('tenantUsers.save'), {
      className: 'primary',
      attrs: { disabled: '' },
      dataset: { userId: user.id },
    });
    const roleFields = el('fieldset', { className: 'tenant-user-roles' }, [
      el('legend', { text: t('tenantUsers.roles') }),
    ]);
    ELEVATED_ROLES.forEach((role) => roleFields.appendChild(roleControl(user, role, checkboxes, saveButton)));

    saveButton.addEventListener('click', async () => {
      if (!service) return;
      const roles = checkedRoles(checkboxes);
      saveButton.disabled = true;
      roleFields.disabled = true;
      announce('tenantUsers.saving');
      try {
        const updatedUser = await service.setElevatedRoles({ userId: user.id, roles });
        replaceUser(updatedUser);
        renderUsers();
        announce('tenantUsers.saved');
        showToast(t('tenantUsers.saved'));
        requestAnimationFrame(() => listRoot?.querySelector(`[data-user-id="${updatedUser.id}"]`)?.focus());
      } catch (error) {
        roleFields.disabled = false;
        saveButton.disabled = sameRoles(roles, elevatedRoles(user));
        announce(errorMessageKey(error));
      }
    });

    const stateKey = user.active ? 'tenantUsers.active' : 'tenantUsers.inactive';
    return el('article', { className: 'card tenant-user-card' }, [
      el('header', { className: 'card-header' }, [
        el('div', {}, [
          el('h3', { text: user.displayName }),
          el('p', { className: 'muted', text: t(stateKey) }),
        ]),
      ]),
      roleFields,
      el('div', { className: 'button-row' }, [saveButton]),
    ]);
  }

  function renderUsers() {
    if (!listRoot) return;
    clear(listRoot);
    if (!users.length) {
      listRoot.appendChild(el('p', { className: 'muted', text: t('tenantUsers.empty') }));
    } else {
      users.forEach((user) => listRoot.appendChild(userCard(user)));
    }
    if (loadMoreButton) {
      loadMoreButton.hidden = nextAfterId === null;
      loadMoreButton.disabled = false;
    }
  }

  async function loadUsers({ reset = false, activeGeneration = generation } = {}) {
    if (!service) {
      announce('tenantUsers.error.unavailable');
      return;
    }
    if (loadMoreButton) loadMoreButton.disabled = true;
    announce('tenantUsers.loading');
    try {
      const page = await service.listUsers({
        limit: 50,
        afterId: reset ? null : nextAfterId,
      });
      if (activeGeneration !== generation) return;
      const previousIds = new Set(reset ? [] : users.map((user) => user.id));
      if (page.users.some((user) => previousIds.has(user.id))) {
        throw new TenantUserAdministrationError('TENANT_USER_PAGE_INVALID');
      }
      users = reset ? [...page.users] : [...users, ...page.users];
      nextAfterId = page.nextAfterId;
      renderUsers();
      announce(users.length ? 'tenantUsers.loaded' : 'tenantUsers.empty');
    } catch (error) {
      if (activeGeneration !== generation) return;
      if (loadMoreButton) loadMoreButton.disabled = false;
      announce(errorMessageKey(error));
    }
  }

  function render() {
    generation += 1;
    const activeGeneration = generation;
    users = [];
    nextAfterId = null;
    setPageHeading(t('tenantUsers.title'), t('tenantUsers.subtitle'));

    const reloadButton = button(t('tenantUsers.reload'));
    reloadButton.addEventListener('click', () => loadUsers({ reset: true, activeGeneration }));
    statusRoot = el('p', {
      className: 'muted',
      text: t('tenantUsers.loading'),
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    });
    listRoot = el('section', {
      className: 'tenant-user-list',
      attrs: { 'aria-label': t('tenantUsers.listLabel') },
    });
    loadMoreButton = button(t('tenantUsers.loadMore'));
    loadMoreButton.hidden = true;
    loadMoreButton.addEventListener('click', () => loadUsers({ activeGeneration }));

    appRoot.appendChild(el('section', { className: 'card' }, [
      el('p', { text: t('tenantUsers.description') }),
      el('div', { className: 'button-row' }, [reloadButton]),
      statusRoot,
    ]));
    appRoot.appendChild(listRoot);
    appRoot.appendChild(el('div', { className: 'button-row' }, [loadMoreButton]));
    void loadUsers({ reset: true, activeGeneration });
  }

  return Object.freeze({ render });
}

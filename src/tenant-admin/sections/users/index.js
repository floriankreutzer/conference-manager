import { formatDateTime, formatNumber, t } from '../../../core/i18n.js';
import { announce, button, clear, el, showToast } from '../../../core/ui.js';
import {
  TENANT_ELEVATED_ROLE,
  canSelectRole,
  elevatedRolesFromUser,
  sameRoleSelection,
} from '../../user-role-model.js';
import {
  TENANT_ADMIN_SECTION_PERMISSION,
  defineTenantAdminSection,
} from '../../section-contract.js';
import {
  USER_FILTER_DEFAULTS,
  normalizedUserFilters,
  userOperationErrorKey,
} from './model.js';

const PAGE_SIZE = 25;

function validAdapter(adapter) {
  return adapter !== null
    && typeof adapter?.listUsers === 'function'
    && typeof adapter?.setRoles === 'function'
    && typeof adapter?.setAccess === 'function';
}

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

function selectControl({ id, label, value, choices }) {
  const control = el('select', { id, name: id });
  choices.forEach(([optionValue, key]) => {
    control.appendChild(el('option', { value: optionValue, text: t(key) }));
  });
  control.value = value;
  return el('label', { className: 'field' }, [
    el('span', { className: 'field-label', text: t(label) }),
    control,
  ]);
}

function userStatus(user) {
  return t(`tenantAdmin.operations.users.status.${user.lifecycle.status}`);
}

function currentSelection(controls) {
  return [
    controls.conferenceManager.checked ? TENANT_ELEVATED_ROLE.CONFERENCE_MANAGER : null,
    controls.tenantAdmin.checked ? TENANT_ELEVATED_ROLE.TENANT_ADMIN : null,
  ].filter(Boolean);
}

function timestamp(value, emptyKey = 'tenantAdmin.operations.common.never') {
  return value === null ? t(emptyKey) : formatDateTime(value);
}

function metadata(user) {
  const items = [
    [
      'tenantAdmin.operations.users.provider.label',
      user.identityProvider.linked
        ? 'tenantAdmin.operations.users.provider.linked'
        : 'tenantAdmin.operations.users.provider.unlinked',
    ],
    [
      'tenantAdmin.operations.users.providerLinkedAt',
      null,
      timestamp(user.identityProvider.linkedAt),
    ],
    [
      'tenantAdmin.operations.users.lastAccess',
      null,
      timestamp(user.lastSignInAt),
    ],
  ];
  const list = el('dl', { className: 'tenant-operations-metadata' });
  items.forEach(([labelKey, valueKey, text]) => {
    list.append(
      el('dt', { text: t(labelKey) }),
      el('dd', { text: valueKey ? t(valueKey) : text }),
    );
  });
  return list;
}

export function createUsersSection({ context, adapter = null } = {}) {
  if (!context || typeof context.userId !== 'function') throw new TypeError('TENANT_ADMIN_CONTEXT_REQUIRED');
  if (adapter !== null && !validAdapter(adapter)) throw new TypeError('TENANT_USER_ADMINISTRATION_INVALID');

  let filters = USER_FILTER_DEFAULTS;
  let afterId = null;
  let nextAfterId = null;
  let cursorHistory = [];
  let pendingFocus = null;

  function loadingPanel() {
    return el('section', {
      className: 'card tenant-admin-status',
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
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

  function filterForm(rerender) {
    const search = el('input', {
      id: 'tenant-user-search',
      name: 'search',
      type: 'search',
      value: filters.search || '',
      placeholder: t('tenantAdmin.operations.users.searchPlaceholder'),
      attrs: { maxlength: '80', autocomplete: 'off' },
    });
    const form = el('form', {
      className: 'card tenant-operations-filter',
      dataset: { tenantUserFilters: 'true' },
      attrs: { 'aria-labelledby': 'tenant-user-filter-heading' },
    }, [
      el('h3', {
        id: 'tenant-user-filter-heading',
        text: t('tenantAdmin.operations.users.filters'),
      }),
      el('div', { className: 'tenant-operations-filter-grid' }, [
        el('label', { className: 'field' }, [
          el('span', { className: 'field-label', text: t('tenantAdmin.operations.users.search') }),
          search,
        ]),
        selectControl({
          id: 'tenant-user-status-filter',
          label: 'tenantAdmin.operations.users.filter.status',
          value: filters.status,
          choices: [
            ['all', 'tenantAdmin.operations.common.all'],
            ['active', 'tenantAdmin.operations.users.status.active'],
            ['disabled', 'tenantAdmin.operations.users.status.disabled'],
          ],
        }),
        selectControl({
          id: 'tenant-user-role-filter',
          label: 'tenantAdmin.operations.users.filter.role',
          value: filters.role,
          choices: [
            ['all', 'tenantAdmin.operations.common.all'],
            ['employee_only', 'tenantAdmin.operations.users.role.employeeOnly'],
            ['conference_manager', 'tenantAdmin.users.roleConferenceManager'],
            ['tenant_admin', 'tenantAdmin.users.roleTenantAdmin'],
          ],
        }),
        selectControl({
          id: 'tenant-user-provider-filter',
          label: 'tenantAdmin.operations.users.filter.provider',
          value: filters.providerLink,
          choices: [
            ['all', 'tenantAdmin.operations.common.all'],
            ['linked', 'tenantAdmin.operations.users.provider.linked'],
            ['unlinked', 'tenantAdmin.operations.users.provider.unlinked'],
          ],
        }),
      ]),
    ]);
    const apply = button(t('tenantAdmin.operations.common.applyFilters'), {
      className: 'primary',
      type: 'submit',
    });
    const reset = button(t('tenantAdmin.operations.common.resetFilters'));
    reset.addEventListener('click', () => {
      filters = USER_FILTER_DEFAULTS;
      afterId = null;
      nextAfterId = null;
      cursorHistory = [];
      pendingFocus = 'results';
      rerender();
    });
    form.appendChild(el('div', { className: 'button-row' }, [apply, reset]));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      filters = normalizedUserFilters({
        search: data.get('search'),
        status: data.get('tenant-user-status-filter'),
        role: data.get('tenant-user-role-filter'),
        providerLink: data.get('tenant-user-provider-filter'),
      });
      afterId = null;
      nextAfterId = null;
      cursorHistory = [];
      pendingFocus = 'results';
      rerender();
    });
    return form;
  }

  function userCard(user, rerender) {
    const self = user.id === context.userId();
    const originalRoles = elevatedRolesFromUser(user);
    const statusId = `tenant-user-status-${user.id}`;
    const headingId = `tenant-user-heading-${user.id}`;
    const card = el('article', {
      className: 'card tenant-user-card tenant-operations-user-card',
      dataset: { tenantUserId: user.id },
      attrs: { 'aria-labelledby': headingId, tabindex: '-1' },
    });
    const header = el('header', { className: 'tenant-user-card-header' }, [
      el('div', {}, [
        el('h3', { id: headingId, text: user.displayName }),
        el('p', { id: statusId, className: 'status-chip', text: userStatus(user) }),
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

    const message = el('p', {
      className: 'field-hint tenant-user-message',
      attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' },
    });
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
    let mutationPending = false;
    let lifecycle = null;
    const updateSaveState = () => {
      save.disabled = mutationPending || sameRoleSelection(originalRoles, currentSelection(controls));
      message.textContent = !user.active
        ? t('tenantAdmin.users.inactiveHint')
        : (self ? t('tenantAdmin.users.selfManagedElsewhere') : '');
    };
    const setMutationPending = (pending) => {
      mutationPending = pending;
      Object.values(controls).forEach((control) => {
        const role = control === controls.conferenceManager
          ? TENANT_ELEVATED_ROLE.CONFERENCE_MANAGER
          : TENANT_ELEVATED_ROLE.TENANT_ADMIN;
        control.disabled = pending || self || !canSelectRole(user, role);
      });
      if (lifecycle) lifecycle.disabled = pending;
      updateSaveState();
    };
    Object.values(controls).forEach((control) => control.addEventListener('change', updateSaveState));

    save.addEventListener('click', async () => {
      if (mutationPending) return;
      setMutationPending(true);
      message.textContent = t('tenantAdmin.users.saving');
      try {
        const updated = await adapter.setRoles(user.id, currentSelection(controls));
        showToast(t('tenantAdmin.users.saved'));
        announce(t('tenantAdmin.users.savedFor', { name: updated.displayName }));
        pendingFocus = updated.id;
        rerender();
      } catch (error) {
        const key = userOperationErrorKey(error?.code, 'roles');
        setMutationPending(false);
        message.textContent = t(key);
        announce(t(key), { assertive: true });
        save.focus();
      }
    });

    const lifecycleMessage = el('p', {
      className: 'field-hint tenant-user-lifecycle-message',
      attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' },
    });
    const nextActive = !user.active;
    lifecycle = button(t(nextActive
      ? 'tenantAdmin.operations.users.reactivate'
      : 'tenantAdmin.operations.users.disable'), {
      className: nextActive ? 'secondary' : 'danger',
      dataset: { tenantUserLifecycleAction: nextActive ? 'reactivate' : 'disable' },
    });
    if (self) lifecycle.hidden = true;
    lifecycle.addEventListener('click', async () => {
      if (mutationPending) return;
      setMutationPending(true);
      lifecycleMessage.textContent = t('tenantAdmin.operations.users.lifecycleSaving');
      try {
        const updated = await adapter.setAccess(user.id, nextActive, user.lifecycle.version);
        const key = updated.active
          ? 'tenantAdmin.operations.users.reactivated'
          : 'tenantAdmin.operations.users.disabled';
        showToast(t(key));
        announce(t('tenantAdmin.operations.users.lifecycleSavedFor', {
          name: updated.displayName,
          state: t(`tenantAdmin.operations.users.status.${updated.lifecycle.status}`),
        }));
        pendingFocus = updated.id;
        rerender();
      } catch (error) {
        const key = userOperationErrorKey(error?.code, 'lifecycle');
        setMutationPending(false);
        lifecycleMessage.textContent = t(key);
        announce(t(key), { assertive: true });
        lifecycle.focus();
      }
    });

    const offboarding = el('section', {
      className: 'tenant-user-offboarding',
      attrs: { 'aria-label': t('tenantAdmin.operations.users.offboarding') },
    }, [
      el('strong', { text: t('tenantAdmin.operations.users.offboarding') }),
      el('p', { text: t('tenantAdmin.operations.users.disableEffect') }),
      user.requestOwnership.openRequestCount > 0
        ? el('p', {
          text: t('tenantAdmin.operations.users.openRequestsPreserved', {
            count: formatNumber(user.requestOwnership.openRequestCount),
          }),
        })
        : null,
    ]);
    if (!user.active || self) offboarding.hidden = true;

    card.append(
      header,
      metadata(user),
      baseline,
      roles,
      message,
      offboarding,
      lifecycleMessage,
      el('div', { className: 'button-row tenant-user-actions' }, [save, lifecycle]),
    );
    return card;
  }

  function pagination(rerender) {
    const previous = button(t('tenantAdmin.operations.common.previousPage'), {
      disabled: cursorHistory.length === 0,
      dataset: { tenantUsersPage: 'previous' },
    });
    previous.addEventListener('click', () => {
      afterId = cursorHistory.pop() ?? null;
      pendingFocus = 'results';
      rerender();
    });
    const next = button(t('tenantAdmin.operations.common.nextPage'), {
      disabled: nextAfterId === null,
      dataset: { tenantUsersPage: 'next' },
    });
    next.addEventListener('click', () => {
      if (nextAfterId === null) return;
      cursorHistory.push(afterId);
      afterId = nextAfterId;
      pendingFocus = 'results';
      rerender();
    });
    return el('nav', {
      className: 'tenant-operations-pagination',
      attrs: { 'aria-label': t('tenantAdmin.operations.users.pagination') },
    }, [
      previous,
      el('span', {
        text: t('tenantAdmin.operations.common.page', { page: formatNumber(cursorHistory.length + 1) }),
      }),
      next,
    ]);
  }

  async function render({ root, isCurrent, rerender }) {
    clear(root);
    const intro = el('section', { className: 'card tenant-admin-intro' }, [
      el('h2', {
        text: t('tenantAdmin.users.title'),
        attrs: { tabindex: '-1' },
      }),
      el('p', { text: t('tenantAdmin.users.description') }),
      context.isDemoRuntime() ? null : el('p', { className: 'muted', text: t('tenantAdmin.users.securityNote') }),
    ]);
    const refresh = button(t('tenantAdmin.users.refresh'), { dataset: { tenantRoleAction: 'refresh' } });
    refresh.addEventListener('click', rerender);
    intro.appendChild(el('div', { className: 'button-row' }, [refresh]));

    const surface = el('section', {
      dataset: { tenantAdminUsers: 'true' },
      attrs: { 'aria-label': t('tenantAdmin.users.title') },
    }, [loadingPanel()]);
    root.append(intro, filterForm(rerender), surface);

    try {
      const page = await adapter.listUsers({ limit: PAGE_SIZE, afterId, ...filters });
      if (!isCurrent()) return;
      nextAfterId = page.nextAfterId;
      clear(surface);
      const resultStatus = el('p', {
        className: 'tenant-operations-result-status',
        text: t('tenantAdmin.users.loaded', { count: formatNumber(page.users.length) }),
        attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', tabindex: '-1' },
      });
      surface.appendChild(resultStatus);
      if (!page.users.length) {
        surface.appendChild(el('section', { className: 'card tenant-admin-status' }, [
          el('strong', { text: t('tenantAdmin.users.empty') }),
          el('p', { className: 'muted', text: t('tenantAdmin.users.emptyHint') }),
        ]));
      } else {
        const list = el('div', { className: 'tenant-user-grid' });
        page.users.forEach((user) => list.appendChild(userCard(user, rerender)));
        surface.appendChild(list);
      }
      surface.appendChild(pagination(rerender));
      announce(t('tenantAdmin.users.loaded', { count: formatNumber(page.users.length) }));
      const focusTarget = pendingFocus;
      pendingFocus = null;
      if (focusTarget !== null) {
        requestAnimationFrame(() => {
          if (focusTarget === 'results') resultStatus.focus();
          else [...surface.querySelectorAll('[data-tenant-user-id]')]
            .find((card) => card.dataset.tenantUserId === focusTarget)
            ?.focus();
        });
      }
    } catch (error) {
      if (!isCurrent()) return;
      clear(surface);
      const key = userOperationErrorKey(error?.code, 'load');
      surface.appendChild(errorPanel(key, rerender));
      announce(t(key), { assertive: true });
    }
  }

  return defineTenantAdminSection({
    id: 'users',
    titleKey: 'tenantAdmin.users.title',
    descriptionKey: 'tenantAdmin.users.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.USERS_MANAGE,
    available: validAdapter(adapter),
    render,
  });
}

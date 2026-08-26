import { REQUEST_STATUS, localTodayIso } from '../core/domain.js';
import { formatDate, formatDateTime, language, setLanguage, t } from '../core/i18n.js';
import { button, clear, el, field, openDialog, showToast } from '../core/ui.js';
import { kpi } from '../shared/application-presentation.js';
import { notificationText } from '../shared/notifications.js';
import { PRODUCTION_AUTH_STATUS } from './production-session.js';

export function renderAppBootstrapLoading() {
  const appRoot = document.getElementById('app');
  const navigationRoot = document.getElementById('primaryNavigation');
  const mainRoot = document.getElementById('mainContent');
  document.title = t('app.title');
  document.getElementById('skipLink').textContent = t('a11y.skip');
  document.getElementById('sidebar').setAttribute('aria-label', t('app.title'));
  document.getElementById('brandTitle').textContent = t('app.title');
  document.getElementById('brandSubtitle').textContent = t('app.internalServices');
  document.getElementById('viewTitle').textContent = t('auth.production.loadingTitle');
  document.getElementById('viewSubtitle').textContent = t('auth.production.loadingText');
  document.getElementById('sidebarFooter').textContent = '';
  clear(navigationRoot);
  navigationRoot.setAttribute('aria-label', t('a11y.mainNav'));
  clear(appRoot);
  mainRoot.setAttribute('aria-busy', 'true');
  appRoot.appendChild(el('section', {
    className: 'card',
    attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
  }, [
    el('h2', { text: t('auth.production.loadingTitle') }),
    el('p', { text: t('auth.production.loadingText') }),
  ]));
}

export function createAppShell({
  context,
  employee,
  manager,
  tenantAdmin = null,
  authentication = null,
  onViewChange = null,
}) {
  if (onViewChange !== null && typeof onViewChange !== 'function') {
    throw new TypeError('APP_SHELL_VIEW_CHANGE_HANDLER_INVALID');
  }

  const appRoot = document.getElementById('app');
  const navigationRoot = document.getElementById('primaryNavigation');
  const titleRoot = document.getElementById('viewTitle');
  const subtitleRoot = document.getElementById('viewSubtitle');
  let view = 'welcome';

  function isProductionRuntime() {
    return !context.isDemoRuntime();
  }

  function setPageHeading(title, subtitle) {
    titleRoot.textContent = title;
    subtitleRoot.textContent = subtitle;
  }

  function productionViewAllowed(nextView) {
    if (nextView === 'welcome') return true;
    if (!context.isAuthenticated()) return false;
    if ((nextView === 'employee' || nextView === 'requests') && employee) return true;
    if (nextView === 'manager' && context.isManager() && manager) return true;
    if (nextView === 'tenantAdmin' && context.canManageTenantUsers() && tenantAdmin) return true;
    return false;
  }

  function setView(nextView) {
    if (isProductionRuntime()) {
      if (!productionViewAllowed(nextView)) nextView = 'welcome';
    } else {
      if (nextView === 'manager' && !context.isManager()) nextView = 'welcome';
      if (nextView === 'tenantAdmin' && (!context.isTenantAdmin() || !tenantAdmin)) nextView = 'welcome';
    }
    onViewChange?.(nextView);
    view = nextView;
    render();
    requestAnimationFrame(() => titleRoot?.focus());
  }

  function navButton(key, targetView) {
    const item = button(t(key), {
      className: `nav-item${view === targetView ? ' active' : ''}`,
      attrs: view === targetView ? { 'aria-current': 'page' } : {},
      dataset: { view: targetView },
    });
    item.addEventListener('click', () => setView(targetView));
    return el('li', {}, item);
  }

  function profileRoleLabel() {
    if (context.isDemoRuntime()) {
      if (context.isTenantAdmin()) return t('profile.role.tenantAdmin');
      return context.isManager() ? t('profile.role.manager') : t('profile.role.employee');
    }
    if (context.isManager() && context.canManageTenantUsers()) return t('profile.role.managerTenantAdmin');
    if (context.isManager()) return t('profile.role.manager');
    if (context.canManageTenantUsers()) return t('profile.role.tenantAdmin');
    return t('profile.role.employee');
  }

  function profileNavigationItem() {
    const initials = context.initials();
    const fullName = context.fullName();
    const profileButton = button(initials ? `${initials} · ${t('nav.profile')}` : t('nav.profile'), {
      className: 'nav-item',
      attrs: {
        'aria-haspopup': 'dialog',
        'aria-label': fullName ? t('a11y.loggedIn', { name: fullName }) : t('nav.profile'),
      },
    });
    profileButton.addEventListener('click', openProfile);
    return el('li', {}, profileButton);
  }

  function renderNavigation() {
    document.title = t('app.title');
    document.getElementById('skipLink').textContent = t('a11y.skip');
    document.getElementById('sidebar').setAttribute('aria-label', t('app.title'));
    document.getElementById('brandTitle').textContent = t('app.title');
    document.getElementById('brandSubtitle').textContent = t('app.internalServices');
    clear(navigationRoot);
    const list = el('ul', { className: 'nav-list' });

    if (isProductionRuntime()) {
      if (context.isAuthenticated()) {
        list.append(navButton('nav.welcome', 'welcome'));
        if (employee) {
          list.append(
            navButton('nav.newRequest', 'employee'),
            navButton('nav.myRequests', 'requests'),
          );
        }
        if (context.isManager() && manager) list.append(navButton('nav.manager', 'manager'));
        if (context.canManageTenantUsers() && tenantAdmin) {
          list.append(navButton('nav.tenantAdmin', 'tenantAdmin'));
        }
        list.append(profileNavigationItem());
      }
    } else {
      list.append(
        navButton('nav.welcome', 'welcome'),
        navButton('nav.newRequest', 'employee'),
        navButton('nav.myRequests', 'requests'),
      );
      if (context.isManager()) list.append(navButton('nav.manager', 'manager'));
      if (context.isTenantAdmin() && tenantAdmin) list.append(navButton('nav.tenantAdmin', 'tenantAdmin'));
      list.append(profileNavigationItem());
    }

    navigationRoot.appendChild(list);
    navigationRoot.setAttribute('aria-label', t('a11y.mainNav'));
    document.getElementById('sidebarFooter').textContent = context.isDemoRuntime() ? t('app.mvp') : '';
  }

  function renderProductionAuthentication() {
    if (context.isAuthenticated()) {
      setPageHeading(t('auth.production.signedInTitle'), t('auth.production.signedInText'));
      const details = el('dl', { className: 'details-list' }, [
        el('dt', { text: t('profile.role') }),
        el('dd', { text: profileRoleLabel() }),
      ]);
      appRoot.appendChild(el('section', { className: 'card' }, [details]));
      return;
    }

    if (context.authenticationStatus() === PRODUCTION_AUTH_STATUS.UNAVAILABLE) {
      setPageHeading(t('auth.production.unavailableTitle'), t('auth.production.unavailableText'));
      const retry = button(t('auth.production.retry'), { className: 'primary' });
      retry.addEventListener('click', () => globalThis.location.reload());
      appRoot.appendChild(el('section', { className: 'card' }, [
        el('p', { text: t('auth.production.unavailableText') }),
        el('div', { className: 'button-row' }, [retry]),
      ]));
      return;
    }

    setPageHeading(t('auth.production.signInTitle'), t('auth.production.signInText'));
    const signIn = button(t('auth.production.signInAction'), { className: 'primary' });
    signIn.addEventListener('click', () => authentication?.signIn());
    appRoot.appendChild(el('section', { className: 'card' }, [
      el('p', { text: t('auth.production.signInText') }),
      el('div', { className: 'button-row' }, [signIn]),
    ]));
  }

  function renderWelcome() {
    setPageHeading(t('nav.welcome'), t('welcome.subtitle'));
    const currentRequests = context.requests();
    const today = localTodayIso();
    const openCount = currentRequests.filter((request) => [
      REQUEST_STATUS.SUBMITTED,
      REQUEST_STATUS.IN_REVIEW,
      REQUEST_STATUS.CHANGE_REQUESTED,
    ].includes(request.status)).length;
    const upcoming = currentRequests.filter(
      (request) => request.status === REQUEST_STATUS.CONFIRMED && request.date >= today,
    );
    const next = [...upcoming]
      .sort((left, right) => `${left.date}${left.start}`.localeCompare(`${right.date}${right.start}`))[0];
    const firstName = String(context.profile.firstName || '').trim();

    const hero = el('section', { className: 'welcome-hero', attrs: { 'aria-labelledby': 'welcomeHeading' } });
    hero.append(
      el('p', { className: 'eyebrow', text: t('app.title') }),
      el('h2', {
        id: 'welcomeHeading',
        text: firstName ? t('welcome.greeting', { name: firstName }) : t('nav.welcome'),
      }),
      el('p', { text: t('welcome.subtitle') }),
    );
    const heroActions = el('div', { className: 'button-row' });
    const newButton = button(t('welcome.new'), { className: 'primary' });
    newButton.addEventListener('click', () => setView('employee'));
    const requestButton = button(t('welcome.bookings'));
    requestButton.addEventListener('click', () => setView('requests'));
    heroActions.append(newButton, requestButton);
    if (employee.hasDraft()) {
      const draftButton = button(t('draft.continue'));
      draftButton.addEventListener('click', employee.restoreDraft);
      heroActions.appendChild(draftButton);
    }
    hero.appendChild(heroActions);

    const overview = el('section', { className: 'dashboard-grid', attrs: { 'aria-label': t('welcome.open') } });
    overview.append(
      kpi(t('welcome.open'), openCount),
      kpi(t('welcome.upcoming'), upcoming.length),
      kpi(t('welcome.today'), upcoming.filter((request) => request.date === today).length),
    );

    const nextSection = el('section', { className: 'card' }, [el('h3', { text: t('welcome.next') })]);
    if (next) {
      nextSection.append(
        el('p', { text: `${next.title} · ${formatDate(next.date)} · ${next.start}–${next.end}` }),
        el('p', {
          text: context.localized(
            context.getCatalog().rooms.find((room) => room.id === next.roomId)?.name || next.roomId,
          ),
        }),
      );
    } else {
      nextSection.append(
        el('strong', { text: t('welcome.none') }),
        el('p', { text: t('welcome.noneText') }),
      );
    }

    const how = el('section', { className: 'card' }, [el('h3', { text: t('welcome.how') })]);
    const list = el('ol', { className: 'how-list' });
    [
      [t('welcome.s1'), t('welcome.s1d')],
      [t('welcome.s2'), t('welcome.s2d')],
      [t('welcome.s3'), t('welcome.s3d')],
      [t('welcome.s4'), t('welcome.s4d')],
    ].forEach(([heading, text]) => list.append(el('li', {}, [
      el('strong', { text: heading }),
      el('span', { text }),
    ])));
    how.appendChild(list);

    const notifications = el('section', { className: 'card' }, [
      el('h3', { text: t('welcome.notifications') }),
    ]);
    const notificationList = context.notifications(4);
    if (!notificationList.length) {
      notifications.appendChild(el('p', { className: 'muted', text: t('welcome.noNotifications') }));
    } else {
      notificationList.forEach((notification) => {
        const text = notificationText(notification);
        notifications.append(el('article', { className: 'notification-card' }, [
          el('strong', { text: text.title }),
          text.text ? el('p', { text: text.text }) : null,
          el('small', { text: formatDateTime(notification.at) }),
        ]));
      });
    }

    appRoot.append(hero, overview, nextSection, how, notifications);
  }

  function openProfile() {
    const content = el('section', { className: 'profile-content' });
    const dl = el('dl', { className: 'details-list' });
    const profileDetails = [];
    if (context.isDemoRuntime() || context.fullName()) {
      profileDetails.push(
        [t('profile.first'), context.profile.firstName],
        [t('profile.last'), context.profile.lastName],
      );
    }
    profileDetails.push([t('profile.role'), profileRoleLabel()]);
    profileDetails.forEach(([term, value]) => dl.append(el('dt', { text: term }), el('dd', { text: value })));
    content.appendChild(dl);

    const languageSelect = el('select');
    [['de', 'Deutsch'], ['en', 'English']]
      .forEach(([value, label]) => languageSelect.append(el('option', { value, text: label })));
    languageSelect.value = language();
    content.appendChild(field({
      id: 'profileLanguage',
      label: t('profile.language'),
      control: languageSelect,
      hint: t('profile.languageNote'),
    }));

    let roleSelect = null;
    if (context.canSwitchRole()) {
      roleSelect = el('select');
      roleSelect.append(
        el('option', { value: 'employee', text: t('profile.role.employee') }),
        el('option', { value: 'manager', text: t('profile.role.manager') }),
        el('option', { value: 'tenant_admin', text: t('profile.role.tenantAdmin') }),
      );
      roleSelect.value = context.role();
      content.appendChild(field({
        id: 'profileRole',
        label: t('profile.demo'),
        control: roleSelect,
        hint: t('profile.demoNote'),
      }));
    }

    const help = button(t('profile.help'));
    const logout = button(t('profile.logout'), { className: 'danger' });
    const close = button(t('common.close'), { className: 'primary' });
    const dialog = openDialog({
      title: t('profile.title'),
      content,
      actions: [help, logout, close],
      labelledById: 'profileTitle',
    });
    close.addEventListener('click', () => dialog.close());
    help.addEventListener('click', () => {
      dialog.close();
      requestAnimationFrame(openHelp);
    });
    logout.addEventListener('click', async () => {
      if (context.isDemoRuntime()) {
        showToast(t('profile.logoutMvp'));
        return;
      }
      logout.disabled = true;
      try {
        if (!authentication) throw new Error('AUTHENTICATION_RUNTIME_UNAVAILABLE');
        await authentication.signOut();
      } catch {
        logout.disabled = false;
        showToast(t('auth.production.logoutFailed'));
      }
    });
    languageSelect.addEventListener('change', () => {
      setLanguage(languageSelect.value);
      dialog.close();
    });
    roleSelect?.addEventListener('change', () => {
      context.setRole(roleSelect.value);
      dialog.close();
      if ((!context.isManager() && view === 'manager')
        || (!context.isTenantAdmin() && view === 'tenantAdmin')) {
        setView('welcome');
        return;
      }
      render();
    });
  }

  function openHelp() {
    const content = el('section', { className: 'help-grid' });
    [
      [t('help.noRoom'), t('help.noRoomText')],
      [t('help.cost'), t('help.costText')],
      [t('help.binding'), t('help.bindingText')],
      [t('help.special'), t('help.specialText')],
    ].forEach(([heading, text]) => content.append(el('article', { className: 'help-card' }, [
      el('h3', { text: heading }),
      el('p', { text }),
    ])));
    const message = el('textarea', { placeholder: t('help.message') });
    content.appendChild(field({ id: 'helpMessage', label: t('help.contact'), control: message }));
    const close = button(t('common.close'));
    const send = button(t('help.send'), { className: 'primary' });
    const dialog = openDialog({
      title: t('help.title'),
      description: t('help.subtitle'),
      content,
      actions: [close, send],
      labelledById: 'helpTitle',
    });
    close.addEventListener('click', () => dialog.close());
    send.addEventListener('click', () => {
      if (!message.value.trim()) {
        message.setAttribute('aria-invalid', 'true');
        message.focus();
        return;
      }
      dialog.close();
      showToast(t('help.sent'));
    });
  }

  function render() {
    document.getElementById('mainContent').removeAttribute('aria-busy');
    clear(appRoot);
    renderNavigation();
    if (isProductionRuntime()) {
      if (!context.isAuthenticated()) {
        renderProductionAuthentication();
        return;
      }
      if (view === 'employee' && employee) {
        void employee.renderRequest();
        return;
      }
      if (view === 'requests' && employee) {
        void employee.renderRequests();
        return;
      }
      if (view === 'manager' && context.isManager() && manager) {
        void manager.renderManager();
        return;
      }
      if (view === 'tenantAdmin' && context.canManageTenantUsers() && tenantAdmin) {
        tenantAdmin.render();
        return;
      }
      renderProductionAuthentication();
      return;
    }
    if (view === 'welcome') renderWelcome();
    else if (view === 'employee') employee.renderRequest();
    else if (view === 'requests') employee.renderRequests();
    else if (view === 'manager') manager.renderManager();
    else if (view === 'tenantAdmin') tenantAdmin?.render();
  }

  return {
    render,
    renderNavigation,
    setPageHeading,
    setView,
    openHelp,
  };
}

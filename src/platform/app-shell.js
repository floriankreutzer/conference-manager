import { REQUEST_STATUS, localTodayIso } from '../core/domain.js';
import { formatDate, formatDateTime, language, setLanguage, t } from '../core/i18n.js';
import { button, clear, el, field, openDialog, showToast } from '../core/ui.js';
import { kpi } from '../shared/application-presentation.js';
import { notificationText, recentNotifications } from '../shared/notifications.js';

export function createAppShell({ context, employee, manager }) {
  const appRoot = document.getElementById('app');
  const navigationRoot = document.getElementById('primaryNavigation');
  const titleRoot = document.getElementById('viewTitle');
  const subtitleRoot = document.getElementById('viewSubtitle');
  let view = 'welcome';

  function setPageHeading(title, subtitle) {
    titleRoot.textContent = title;
    subtitleRoot.textContent = subtitle;
  }

  function setView(nextView) {
    if (nextView === 'manager' && !context.isManager()) nextView = 'welcome';
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

  function renderNavigation() {
    document.title = t('app.title');
    document.getElementById('skipLink').textContent = t('a11y.skip');
    document.getElementById('sidebar').setAttribute('aria-label', t('app.title'));
    document.getElementById('brandTitle').textContent = t('app.title');
    document.getElementById('brandSubtitle').textContent = t('app.internalServices');
    clear(navigationRoot);
    const list = el('ul', { className: 'nav-list' });
    list.append(
      navButton('nav.welcome', 'welcome'),
      navButton('nav.newRequest', 'employee'),
      navButton('nav.myRequests', 'requests'),
    );
    if (context.isManager()) list.append(navButton('nav.manager', 'manager'));
    const profileButton = button(`${context.initials()} · ${t('nav.profile')}`, {
      className: 'nav-item',
      attrs: {
        'aria-haspopup': 'dialog',
        'aria-label': t('a11y.loggedIn', { name: context.fullName() }),
      },
    });
    profileButton.addEventListener('click', openProfile);
    list.append(el('li', {}, profileButton));
    navigationRoot.appendChild(list);
    navigationRoot.setAttribute('aria-label', t('a11y.mainNav'));
    document.getElementById('sidebarFooter').textContent = t('app.mvp');
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

    const hero = el('section', { className: 'welcome-hero', attrs: { 'aria-labelledby': 'welcomeHeading' } });
    hero.append(
      el('p', { className: 'eyebrow', text: t('app.title') }),
      el('h2', { id: 'welcomeHeading', text: t('welcome.greeting', { name: context.profile.firstName }) }),
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
    const notificationList = recentNotifications(4);
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
    [
      [t('profile.first'), context.profile.firstName],
      [t('profile.last'), context.profile.lastName],
      [t('profile.role'), context.isManager() ? t('profile.role.manager') : t('profile.role.employee')],
    ].forEach(([term, value]) => dl.append(el('dt', { text: term }), el('dd', { text: value })));
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

    const roleSelect = el('select');
    roleSelect.append(
      el('option', { value: 'employee', text: t('profile.role.employee') }),
      el('option', { value: 'manager', text: t('profile.role.manager') }),
    );
    roleSelect.value = context.role();
    content.appendChild(field({
      id: 'profileRole',
      label: t('profile.demo'),
      control: roleSelect,
      hint: t('profile.demoNote'),
    }));

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
    logout.addEventListener('click', () => showToast(t('profile.logoutMvp')));
    languageSelect.addEventListener('change', () => {
      setLanguage(languageSelect.value);
      dialog.close();
    });
    roleSelect.addEventListener('change', () => {
      context.setRole(roleSelect.value);
      dialog.close();
      if (!context.isManager() && view === 'manager') view = 'welcome';
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
    clear(appRoot);
    renderNavigation();
    if (view === 'welcome') renderWelcome();
    else if (view === 'employee') employee.renderRequest();
    else if (view === 'requests') employee.renderRequests();
    else if (view === 'manager') manager.renderManager();
  }

  return {
    render,
    renderNavigation,
    setPageHeading,
    setView,
    openHelp,
  };
}

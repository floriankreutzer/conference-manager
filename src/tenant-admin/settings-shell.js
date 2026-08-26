import { t } from '../core/i18n.js';
import { button, clear, el } from '../core/ui.js';

const OVERVIEW_ID = 'overview';
const ROUTE_PREFIX = '#tenant-admin/';

function sectionIds(sections) {
  return new Set(sections.filter((section) => section.available).map((section) => section.id));
}

export function tenantAdminSectionFromHash(hash, sections) {
  const availableIds = sectionIds(sections);
  const raw = String(hash || '');
  if (!raw.startsWith(ROUTE_PREFIX)) return OVERVIEW_ID;
  let candidate = '';
  try {
    candidate = decodeURIComponent(raw.slice(ROUTE_PREFIX.length).split(/[?#]/, 1)[0]);
  } catch {
    return OVERVIEW_ID;
  }
  return availableIds.has(candidate) ? candidate : OVERVIEW_ID;
}

export function tenantAdminHashForSection(sectionId) {
  const normalized = String(sectionId || OVERVIEW_ID);
  return `${ROUTE_PREFIX}${encodeURIComponent(normalized)}`;
}

export function isTenantAdminRoute(hash = globalThis.location?.hash) {
  return /^#tenant-admin(?:\/|$)/.test(String(hash || ''));
}

export function createTenantAdminSettingsShell({
  appRoot,
  setPageHeading,
  sections,
  history = globalThis.history,
  location = globalThis.location,
} = {}) {
  if (!(appRoot instanceof HTMLElement)) throw new TypeError('TENANT_ADMIN_ROOT_REQUIRED');
  if (typeof setPageHeading !== 'function') throw new TypeError('TENANT_ADMIN_HEADING_REQUIRED');
  if (!Array.isArray(sections) || sections.some((section) => !section || typeof section.render !== 'function')) {
    throw new TypeError('TENANT_ADMIN_SECTIONS_REQUIRED');
  }
  if (new Set(sections.map((section) => section.id)).size !== sections.length) {
    throw new TypeError('TENANT_ADMIN_SECTION_DUPLICATE');
  }

  let generation = 0;

  function navigate(sectionId) {
    const nextHash = tenantAdminHashForSection(sectionId);
    if (location?.hash !== nextHash) history?.replaceState?.(null, '', nextHash);
    render();
    requestAnimationFrame(() => {
      appRoot.querySelector('[data-tenant-admin-section-content] h2')?.focus();
    });
  }

  function overview(availableSections) {
    const section = el('section', {
      className: 'tenant-admin-overview',
      attrs: { 'aria-labelledby': 'tenantAdminOverviewTitle' },
    }, [
      el('div', { className: 'card tenant-admin-intro' }, [
        el('h2', {
          id: 'tenantAdminOverviewTitle',
          text: t('tenantAdmin.overview.title'),
          attrs: { tabindex: '-1' },
        }),
        el('p', { text: t('tenantAdmin.overview.description') }),
      ]),
    ]);
    const grid = el('div', { className: 'tenant-admin-section-grid' });
    availableSections.forEach((registeredSection) => {
      const open = button(t('tenantAdmin.overview.open', { section: t(registeredSection.titleKey) }), {
        className: 'secondary',
        dataset: { tenantAdminOpenSection: registeredSection.id },
      });
      open.addEventListener('click', () => navigate(registeredSection.id));
      grid.appendChild(el('article', { className: 'card tenant-admin-section-card' }, [
        el('h3', { text: t(registeredSection.titleKey) }),
        el('p', { text: t(registeredSection.descriptionKey) }),
        el('div', { className: 'button-row' }, [open]),
      ]));
    });
    section.appendChild(grid);
    return section;
  }

  function navigation(activeId, availableSections) {
    const nav = el('nav', {
      className: 'tenant-admin-section-nav',
      attrs: { 'aria-label': t('tenantAdmin.navigation.label') },
    });
    const list = el('ul', { className: 'tenant-admin-section-nav-list' });

    const appendItem = (id, label) => {
      const item = button(label, {
        className: `tenant-admin-section-nav-button${activeId === id ? ' active' : ''}`,
        attrs: activeId === id ? { 'aria-current': 'page' } : {},
        dataset: { tenantAdminSection: id },
      });
      item.addEventListener('click', () => navigate(id));
      list.appendChild(el('li', {}, [item]));
    };

    appendItem(OVERVIEW_ID, t('tenantAdmin.overview.title'));
    availableSections.forEach((section) => appendItem(section.id, t(section.titleKey)));
    nav.appendChild(list);
    return nav;
  }

  function render() {
    generation += 1;
    const currentGeneration = generation;
    const availableSections = sections.filter((section) => section.available);
    const activeId = tenantAdminSectionFromHash(location?.hash, availableSections);
    const activeSection = availableSections.find((section) => section.id === activeId) || null;

    if (location?.hash !== tenantAdminHashForSection(activeId)) {
      history?.replaceState?.(null, '', tenantAdminHashForSection(activeId));
    }

    setPageHeading(
      activeSection ? t(activeSection.titleKey) : t('tenantAdmin.title'),
      activeSection ? t(activeSection.descriptionKey) : t('tenantAdmin.subtitle'),
    );
    clear(appRoot);

    const shell = el('div', { className: 'tenant-admin-settings-shell', dataset: { tenantAdminShell: 'true' } });
    const content = el('section', {
      className: 'tenant-admin-section-content',
      dataset: { tenantAdminSectionContent: activeId },
      attrs: { 'aria-live': 'polite' },
    });
    shell.append(navigation(activeId, availableSections), content);
    appRoot.appendChild(shell);

    if (!activeSection) {
      content.appendChild(overview(availableSections));
      return;
    }

    Promise.resolve(activeSection.render({
      root: content,
      generation: currentGeneration,
      isCurrent: () => generation === currentGeneration,
      rerender: render,
    })).then(() => {
      if (generation !== currentGeneration) return;
      requestAnimationFrame(() => content.querySelector('h2')?.focus());
    }).catch(() => {
      if (generation !== currentGeneration) return;
      clear(content);
      content.appendChild(el('section', {
        className: 'card tenant-admin-status',
        attrs: { role: 'alert' },
      }, [
        el('h2', { text: t(activeSection.titleKey), attrs: { tabindex: '-1' } }),
        el('p', { text: t('tenantAdmin.section.errorText') }),
      ]));
    });
  }

  return Object.freeze({ render, navigate });
}

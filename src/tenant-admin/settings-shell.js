import { t } from '../core/i18n.js';
import { button, clear, el } from '../core/ui.js';
import {
  tenantAdminHashForSection,
  tenantAdminSectionFromHash,
} from './route.js';

const OVERVIEW_ID = 'overview';

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
  let focusSectionId = null;

  function focusActiveHeading(sectionId, currentGeneration) {
    if (generation !== currentGeneration || focusSectionId !== sectionId) return;
    requestAnimationFrame(() => {
      if (generation !== currentGeneration || focusSectionId !== sectionId) return;
      appRoot.querySelector('[data-tenant-admin-section-content] h2')?.focus();
      focusSectionId = null;
    });
  }

  function navigate(sectionId) {
    const nextHash = tenantAdminHashForSection(sectionId);
    if (location?.hash !== nextHash) history?.replaceState?.(null, '', nextHash);
    focusSectionId = sectionId;
    render();
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
      focusActiveHeading(OVERVIEW_ID, currentGeneration);
      return;
    }

    const sectionRender = activeSection.render({
      root: content,
      generation: currentGeneration,
      isCurrent: () => generation === currentGeneration,
      navigate,
      rerender: render,
    });
    // Section renderers attach their heading synchronously before loading data.
    // Consume explicit-navigation focus now so it cannot override a later,
    // section-owned mutation focus after an asynchronous rerender.
    focusActiveHeading(activeSection.id, currentGeneration);
    Promise.resolve(sectionRender).catch(() => {
      if (generation !== currentGeneration) return;
      clear(content);
      content.appendChild(el('section', {
        className: 'card tenant-admin-status',
        attrs: { role: 'alert' },
      }, [
        el('h2', { text: t(activeSection.titleKey), attrs: { tabindex: '-1' } }),
        el('p', { text: t('tenantAdmin.section.errorText') }),
      ]));
      requestAnimationFrame(() => {
        if (generation === currentGeneration) content.querySelector('h2')?.focus();
      });
    });
  }

  return Object.freeze({ render, navigate });
}

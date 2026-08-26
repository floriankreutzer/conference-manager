import { t } from '../core/i18n.js';
import { clear, el } from '../core/ui.js';

export function renderSectionLoading(root, titleKey) {
  clear(root);
  root.appendChild(el('section', {
    className: 'card tenant-admin-status',
    attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
  }, [
    el('strong', { text: t('tenantAdmin.section.loading', { section: t(titleKey) }) }),
  ]));
}

export function renderSectionError(root, titleKey) {
  clear(root);
  root.appendChild(el('section', {
    className: 'card tenant-admin-status',
    attrs: { role: 'alert' },
  }, [
    el('h2', {
      text: t('tenantAdmin.section.errorTitle', { section: t(titleKey) }),
      attrs: { tabindex: '-1' },
    }),
    el('p', { text: t('tenantAdmin.section.errorText') }),
  ]));
}

export function renderSectionEmpty(root, titleKey, descriptionKey) {
  clear(root);
  root.appendChild(el('section', { className: 'card tenant-admin-status' }, [
    el('h2', { text: t(titleKey), attrs: { tabindex: '-1' } }),
    el('p', { text: t(descriptionKey) }),
    el('p', { className: 'muted', text: t('tenantAdmin.section.empty') }),
  ]));
}

import { t } from '../core/i18n.js';
import { button, clear, el } from '../core/ui.js';
import { assertTenantSettingsRevision } from './settings-revision.js';

export function renderSectionLoading(root, titleKey) {
  clear(root);
  root.appendChild(el('section', {
    className: 'card tenant-admin-status',
    attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
  }, [
    el('h2', { text: t(titleKey), attrs: { tabindex: '-1' } }),
    el('p', { text: t('tenantAdmin.section.loading', { section: t(titleKey) }) }),
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

export function renderSectionConflict(root, titleKey, {
  currentRevision,
  onReload,
  onReapply = null,
} = {}) {
  const revision = assertTenantSettingsRevision(currentRevision);
  if (typeof onReload !== 'function' || (onReapply !== null && typeof onReapply !== 'function')) {
    throw new TypeError('TENANT_SETTINGS_CONFLICT_ACTION_INVALID');
  }

  const reload = button(t('tenantAdmin.section.conflictReload'), {
    dataset: { tenantSettingsConflictReload: 'true' },
  });
  reload.addEventListener('click', onReload);
  const actions = [reload];
  if (onReapply) {
    const reapply = button(t('tenantAdmin.section.conflictReapply'), {
      className: 'secondary',
      dataset: { tenantSettingsConflictReapply: 'true' },
    });
    reapply.addEventListener('click', onReapply);
    actions.push(reapply);
  }

  clear(root);
  root.appendChild(el('section', {
    className: 'card tenant-admin-status',
    attrs: { role: 'alert' },
  }, [
    el('h2', {
      text: t('tenantAdmin.section.conflictTitle', { section: t(titleKey) }),
      attrs: { tabindex: '-1' },
    }),
    el('p', { text: t('tenantAdmin.section.conflictText') }),
    el('p', {
      className: 'muted',
      text: t('tenantAdmin.section.revision', { revision }),
    }),
    el('div', { className: 'button-row' }, actions),
  ]));
}

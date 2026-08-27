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
  const feedback = [];
  if (onReapply) {
    const pendingStatus = el('p', {
      className: 'field-hint',
      dataset: { tenantSettingsConflictPending: 'true' },
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    });
    pendingStatus.hidden = true;
    const errorStatus = el('p', {
      className: 'field-hint',
      dataset: { tenantSettingsConflictError: 'true' },
      attrs: { role: 'alert', 'aria-live': 'assertive', 'aria-atomic': 'true' },
    });
    errorStatus.hidden = true;
    const reapply = button(t('tenantAdmin.section.conflictReapply'), {
      className: 'secondary',
      dataset: { tenantSettingsConflictReapply: 'true' },
    });
    actions.push(reapply);
    feedback.push(pendingStatus, errorStatus);

    let reapplyPending = false;
    const setReapplyPending = (pending) => {
      reapplyPending = pending;
      actions.forEach((action) => { action.disabled = pending; });
      pendingStatus.textContent = pending ? t('tenantSettings.status.saving') : '';
      pendingStatus.hidden = !pending;
    };
    reapply.addEventListener('click', async () => {
      if (reapplyPending) return;
      errorStatus.textContent = '';
      errorStatus.hidden = true;
      setReapplyPending(true);
      try {
        await onReapply();
      } catch {
        setReapplyPending(false);
        errorStatus.textContent = t('tenantSettings.status.saveFailed');
        errorStatus.hidden = false;
        if (reapply.isConnected) reapply.focus();
        return;
      }
      setReapplyPending(false);
    });
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
    ...feedback,
  ]));
}

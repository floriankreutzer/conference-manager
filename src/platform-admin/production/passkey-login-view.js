import { createPlatformPasskeyGrantDeliveryView } from './passkey-grant-delivery-view.js';
import { t } from '../../core/i18n.js';
import { button, clear, el, field } from '../../core/ui.js';
import { PLATFORM_ADMIN_SIGN_IN_PATH } from './operator-session.js';

const ACTION_KEYS = Object.freeze({
  passkey_required: 'platformAdmin.passkey.assert',
  registration_required: 'platformAdmin.passkey.register',
  possession_required: 'platformAdmin.passkey.prove',
});

export function createPlatformPasskeyLoginView({ controller } = {}) {
  if (!['snapshot','load','continue','startEnrollment','cancel'].every(name => typeof controller?.[name] === 'function')) {
    throw new TypeError('PLATFORM_PASSKEY_LOGIN_CONTROLLER_REQUIRED');
  }
  const element = el('section', { className: 'card platform-admin-session-gate',
    attrs: { 'aria-labelledby': 'platformPasskeyTitle' } });
  let previousPhase = null;
  const delivery = createPlatformPasskeyGrantDeliveryView({ controller, onChange: () => update() });
  function update(state = controller.snapshot()) {
    const active = document.activeElement; const hadFocus = element.contains(active); const phaseChanged = state.phase !== previousPhase;
    previousPhase = state.phase; clear(element);
    const phase = ['legacy','sign_in','loading','enrollment_required','registration_required','possession_required',
      'passkey_required','credential_enrolled','setup_complete','authenticated'].includes(state.phase) ? state.phase : 'loading';
    const title = el('h2', { id: 'platformPasskeyTitle', text: t(`platformAdmin.passkey.title.${phase}`), attrs: { tabindex: '-1' } });
    element.append(title, el('p', { text: t(`platformAdmin.passkey.text.${phase}`) }));
    if (state.mode === 'passkey_setup') element.append(el('p', { className: 'platform-admin-data-note',
      text: t('platformAdmin.passkey.setupOnly') }));
    if (state.error) element.append(el('p', { attrs: { role: 'alert' }, text: t(`platformAdmin.passkey.error.${state.error}`) }));
    if (state.busy) element.append(el('p', { attrs: { role: 'status' }, text: t('platformAdmin.passkey.busy') }));
    if (phase !== 'loading' && (state.environment !== 'int' || state.mode !== 'passkey_setup'
      || !['sign_in','enrollment_required','passkey_required'].includes(phase))) delivery.dispose();
    if (state.environment === 'int' && state.mode === 'passkey_setup'
      && ['sign_in','enrollment_required','passkey_required'].includes(phase)) element.append(delivery.render());
    if (phase === 'enrollment_required') {
      const grantId = el('input', { type: 'text', attrs: { required: 'required', maxlength: '36', minlength: '36',
        autocomplete: 'off', spellcheck: 'false', autocapitalize: 'none' } });
      const token = el('input', { type: 'password', attrs: { required: 'required', maxlength: '43', minlength: '43',
        autocomplete: 'off', spellcheck: 'false', autocapitalize: 'none' } });
      const submit = button(t('platformAdmin.passkey.enroll'), { type: 'submit', className: 'primary', disabled: state.busy });
      const form = el('form', { attrs: { autocomplete: 'off' } }, [
        field({ id: 'platformPasskeyGrant', label: t('platformAdmin.passkey.grantId'), control: grantId, required: true }),
        field({ id: 'platformPasskeyApproval', label: t('platformAdmin.passkey.grantToken'), control: token, required: true }),
        el('div', { className: 'button-row' }, [submit]),
      ]);
      grantId.disabled = state.busy; token.disabled = state.busy;
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (!form.reportValidity() || controller.snapshot().busy) return;
        const grant = { grantId: grantId.value, token: token.value }; token.value = ''; grantId.value = '';
        void controller.startEnrollment(grant);
      });
      element.append(form);
    }
    if (ACTION_KEYS[phase]) {
      const action = button(t(ACTION_KEYS[phase]), { className: 'primary', disabled: state.busy });
      action.addEventListener('click', () => { void controller.continue(); });
      element.append(el('div', { className: 'button-row' }, [action]));
    }
    if (state.busy && phase !== 'loading') {
      const cancel = button(t('common.cancel')); cancel.addEventListener('click', () => controller.cancel()); element.append(cancel);
    } else if (!state.busy) {
      const controls = el('div', { className: 'button-row' });
      controls.append(el('a', { href: PLATFORM_ADMIN_SIGN_IN_PATH, className: 'primary button-link',
        text: t('platformAdmin.session.signIn'),
        ...(delivery.hasRequest() ? { attrs: { target: '_blank', rel: 'noopener noreferrer' } } : {}) }));
      if (state.error || phase === 'loading' || delivery.hasRequest()) {
        const reload = button(t('platformAdmin.passkey.resume')); reload.addEventListener('click', () => { void controller.load(); });
        controls.append(reload);
      }
      element.append(controls);
    }
    // Do not steal focus from locale/navigation. Restore focus only when this
    // view replaced the user's focused control after an asynchronous transition.
    if (hadFocus && active?.isConnected === false) {
      if (phaseChanged || state.error) title.focus();
      else (element.querySelector('button:not(:disabled), input:not(:disabled), a') || title).focus();
    }
    return element;
  }
  return Object.freeze({ element, update, render: () => update(), stop: () => delivery.dispose() });
}

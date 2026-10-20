import { formatDateTime,language,setLanguage,t } from '../../core/i18n.js';
import { button,clear,el,field } from '../../core/ui.js';

export function createCustomerEmailLoginView({ controller,signInWithMicrosoft,operatorTestEnabled=false } = {}) {
  if (!controller || ['snapshot','subscribe','request','verify','select','restart','resume','checkSession']
    .some(name => typeof controller[name]!=='function') || typeof signInWithMicrosoft!=='function' || typeof operatorTestEnabled!=='boolean') {
    throw new TypeError('CUSTOMER_EMAIL_LOGIN_VIEW_CONFIGURATION_INVALID');
  }
  const element=el('section',{ className: 'card',attrs: { 'aria-labelledby': 'customerAuthTitle' } });
  let previousPhase=null;
  function update(state=controller.snapshot()) {
    const active=document.activeElement,hadFocus=element.contains(active),focusId=active?.id;
    const samePhase=state.phase===previousPhase;
    const email=samePhase ? element.querySelector('#customerAuthEmail')?.value ?? '' : '';
    const code=samePhase ? element.querySelector('#customerAuthCode')?.value ?? '' : '';
    previousPhase=state.phase; clear(element);
    const title=el('h2',{ id: 'customerAuthTitle',text: t(`customerAuth.title.${state.phase}`),attrs: { tabindex: '-1' } });
    element.append(title);
    const languageControl=el('select',{ id: 'customerAuthLanguage' },['de','en'].map(value => el('option',{
      value,text: t(`customerAuth.language.${value}`),
    })));
    languageControl.value=language();
    languageControl.addEventListener('change',() => {
      setLanguage(languageControl.value); update(); element.querySelector('#customerAuthLanguage')?.focus();
    });
    element.append(field({ id: 'customerAuthLanguage',label: t('customerAuth.language'),control: languageControl }));
    if (state.error) element.append(el('p',{ id: 'customerAuthError',text: t(`customerAuth.error.${state.error}`),
      attrs: { role: 'alert' } }));
    if (state.phase==='loading') {
      const status=el('p',{ text: t('customerAuth.loading'),attrs: { role: 'status',tabindex: '-1' } });
      element.append(status); if (hadFocus) status.focus(); return;
    }
    if (state.expiresAt) element.append(el('p',{ text: t('customerAuth.expires',{ time: formatDateTime(state.expiresAt) }) }));
    if (state.phase==='email' || state.phase==='code') {
      const emailPhase=state.phase==='email',id=emailPhase ? 'customerAuthEmail' : 'customerAuthCode';
      const hint=t(emailPhase ? 'customerAuth.emailHint' : 'customerAuth.codeHint');
      const control=el('input',{ type: emailPhase ? 'email' : 'text',id,value: emailPhase ? email : code,
        attrs: { required: '',maxlength: emailPhase ? '254' : '8',autocomplete: emailPhase ? 'email' : 'one-time-code',
          autocapitalize: 'none',spellcheck: 'false','aria-describedby': `${id}Hint${state.error ? ' customerAuthError' : ''}`,
          'aria-invalid': state.error==='rejected' ? 'true' : 'false',
          ...(emailPhase ? {} : { inputmode: 'numeric',pattern: '[0-9]{8}' }) } });
      // Keep the native label concise. The separate described hint must not
      // become part of the input's accessible name through the wrapping label.
      const entry=field({ id,label: t(emailPhase ? 'customerAuth.email' : 'customerAuth.code'),control });
      const hintElement=el('small',{ id: `${id}Hint`,className: 'field-hint',text: hint });
      const submit=button(t(emailPhase ? 'customerAuth.request' : 'customerAuth.verify'),{ className: 'primary',type: 'submit' });
      const form=el('form',{},[entry,hintElement,el('div',{ className: 'button-row' },[submit])]);
      form.addEventListener('submit',event => {
        event.preventDefault(); const value=control.value; control.value='';
        void (emailPhase ? controller.request(value,language()) : controller.verify(value));
      });
      element.append(form);
    }
    if (state.phase==='choices' && state.items.length) {
      const select=el('select',{ id: 'customerAuthOrganisation',attrs: { required: '' } },[
        el('option',{ value: '',text: t('customerAuth.choose'),attrs: { disabled: '',selected: '' } }),
        ...state.items.map(item => el('option',{ value: item.membershipId,text: item.displayName })),
      ]);
      const submit=button(t('customerAuth.continue'),{ className: 'primary',type: 'submit' });
      const form=el('form',{},[field({ id: 'customerAuthOrganisation',label: t('customerAuth.organisation'),
        control: select }),el('div',{ className: 'button-row' },[submit])]);
      form.addEventListener('submit',event => { event.preventDefault(); void controller.select(select.value); });
      element.append(form);
    }
    const actions=[];
    if (state.phase==='resume_required') {
      const resume=button(t('customerAuth.resume'),{ className: 'primary' });
      resume.addEventListener('click',() => { void controller.resume(); }); actions.push(resume);
    }
    if (state.phase==='refresh_required') {
      const check=button(t('customerAuth.checkSession'),{ className: 'primary' });
      check.addEventListener('click',() => { void controller.checkSession(); }); actions.push(check);
    }
    if (!['email','authenticated'].includes(state.phase)) {
      const restart=button(t('customerAuth.restart')); restart.addEventListener('click',controller.restart); actions.push(restart);
    }
    if (state.phase!=='authenticated') {
      const microsoft=button(t('customerAuth.microsoft')); microsoft.addEventListener('click',signInWithMicrosoft); actions.push(microsoft);
    }
    if (actions.length) element.append(el('div',{ className: 'button-row' },actions));
    element.append(el('p',{ text: t('customerAuth.description') }));
    if (operatorTestEnabled && state.phase==='email') {
      element.append(el('form',{ attrs: { action: '/api/v1/auth/delegation/start',method: 'post' } },[
        button(t('customerHandoff.start'),{ type: 'submit' }),
      ]));
    }
    if (hadFocus) {
      const target=(samePhase && focusId ? element.querySelector(`#${focusId}`) : null)
        || (state.error && ['email','code'].includes(state.phase) ? element.querySelector('input') : null) || title;
      target.focus();
    }
  }
  const unsubscribe=controller.subscribe(update); update();
  return Object.freeze({ element,update,dispose() { unsubscribe(); controller.dispose(); } });
}

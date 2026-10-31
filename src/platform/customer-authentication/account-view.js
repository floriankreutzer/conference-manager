import { language,setLanguage,t } from '../../core/i18n.js';
import { button,clear,el,field } from '../../core/ui.js';
let nextId=0;
export function createCustomerAccountView({ controller,heading='h2',languageControl=false,closeAction=true }={}) {
  if (!controller || ['snapshot','subscribe','start','confirm','check','reauthenticate','cancel','dispose']
    .some(name=>typeof controller[name]!=='function') || !['h2','h3'].includes(heading)
    || typeof languageControl!=='boolean' || typeof closeAction!=='boolean') {
    throw new TypeError('CUSTOMER_ACCOUNT_VIEW_CONFIGURATION_INVALID');
  }
  const id=`customerAccount${++nextId}`,element=el('section',{ className: 'card',attrs: { 'aria-labelledby': `${id}Title` } });
  let previousPhase=null;
  function update(state=controller.snapshot()) {
    element.setAttribute('aria-busy',String(['loading','redirecting'].includes(state.phase)));
    const active=document.activeElement,hadFocus=element.contains(active),focusId=active?.id;
    const samePhase=state.phase===previousPhase;previousPhase=state.phase;clear(element);
    const title=el(heading,{ id: `${id}Title`,text: t('customerAccount.title'),attrs: { tabindex: '-1' } });element.append(title);
    if (languageControl) {
      const select=el('select',{ id: `${id}Language` },['de','en'].map(value=>el('option',{
        value,text: t(`customerAuth.language.${value}`) })));
      select.value=language();select.addEventListener('change',()=>{
        setLanguage(select.value);update();element.querySelector(`#${id}Language`)?.focus();
      });element.append(field({ id: `${id}Language`,label: t('customerAuth.language'),control: select }));
    }
    element.append(el('p',{ text: t(`customerAccount.phase.${state.phase}`),attrs: { role: 'status','aria-live': 'polite' } }));
    if (state.error) element.append(el('p',{ text: t(`customerAccount.error.${state.error}`),attrs: { role: 'alert' } }));
    const actions=[];
    function action(key,method,primary=false) {
      const control=button(t(key),{ className: primary ? 'primary' : '' });
      control.addEventListener('click',()=>{ void controller[method](); });actions.push(control);
    }
    if (state.phase==='ready') action('customerAccount.start','start',true);
    if (state.phase==='confirmation') action('customerAccount.confirm','confirm',true);
    if (state.phase==='reauthentication_required') action('customerAccount.reauthenticate','reauthenticate',true);
    if (['refresh_required','check_required'].includes(state.phase)) action('customerAccount.check','check',true);
    if (closeAction && !['loading','redirecting'].includes(state.phase)) {
      action(state.phase==='confirmation' ? 'common.cancel' : 'common.close','cancel');
    }
    if (actions.length) element.append(el('div',{ className: 'button-row' },actions));
    if (hadFocus) (samePhase && focusId ? element.querySelector(`#${focusId}`) : null)?.focus();
    if (hadFocus && !element.contains(document.activeElement)) title.focus();
  }
  const unsubscribe=controller.subscribe(update);update();
  return Object.freeze({ element,update,dispose() { unsubscribe();controller.dispose(); } });
}

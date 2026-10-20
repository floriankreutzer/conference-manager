import { language,setLanguage,t } from '../../core/i18n.js';
import { button,clear,el,field } from '../../core/ui.js';
let nextId=0;
export function createCustomerHandoffView({ controller }={}) {
  if (!controller || ['snapshot','subscribe','confirm','switchAccount','check','restart','cancel','dispose']
    .some(name=>typeof controller[name]!=='function')) throw new TypeError('CUSTOMER_HANDOFF_VIEW_CONFIGURATION_INVALID');
  const id=`customerHandoff${++nextId}`,element=el('section',{ className: 'card',attrs: { 'aria-labelledby': `${id}Title` } });
  let phase=null;
  function update(state=controller.snapshot()) {
    const active=document.activeElement,hadFocus=element.contains(active),focusId=active?.id,same=phase===state.phase;
    phase=state.phase;clear(element);
    const title=el('h2',{ id: `${id}Title`,text: t('customerHandoff.title'),attrs: { tabindex: '-1' } });element.append(title);
    const select=el('select',{ id: `${id}Language` },['de','en'].map(value=>el('option',{
      value,text: t(`customerAuth.language.${value}`) })));
    select.value=language();select.addEventListener('change',()=>{
      setLanguage(select.value);update();element.querySelector(`#${id}Language`)?.focus();
    });element.append(field({ id: `${id}Language`,label: t('customerAuth.language'),control: select }));
    element.append(el('p',{ text: t(`customerHandoff.phase.${state.phase}`),attrs: { role: 'status','aria-live': 'polite' } }));
    if (state.slot && state.role) element.append(el('p',{ text: t('customerHandoff.selection',{
      organisation: t(`customerHandoff.slot.${state.slot}`),role: t(`customerHandoff.role.${state.role}`) }) }));
    if (state.error) element.append(el('p',{ text: t(`customerHandoff.error.${state.error}`),attrs: { role: 'alert' } }));
    const actions=[];
    function action(key,method,primary=false) {
      const control=button(t(key),{ id: `${id}${method}`,className: primary ? 'primary' : '' });
      control.addEventListener('click',()=>{ void controller[method](); });actions.push(control);
    }
    if (state.phase==='confirmation') action('customerHandoff.confirm','confirm',true);
    if (state.phase==='switch_required') action('customerHandoff.switch','switchAccount',true);
    if (['check_required','continuing'].includes(state.phase)) action('customerHandoff.check','check',true);
    if (['expired','check_required','continuing'].includes(state.phase)) action('customerHandoff.restart','restart');
    if (state.phase!=='loading') action('common.cancel','cancel');
    if (actions.length) element.append(el('div',{ className: 'button-row' },actions));
    element.append(el('p',{ text: t('customerHandoff.disclosure') }));
    if (hadFocus) ((same && focusId ? element.querySelector(`#${focusId}`) : null) || title).focus();
  }
  const unsubscribe=controller.subscribe(update);update();
  return Object.freeze({ element,update,dispose() { unsubscribe();controller.dispose(); } });
}

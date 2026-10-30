import { microsoftSignInControl } from '../../../core/microsoft-sign-in-control.js';
import { t } from '../../../core/i18n.js';
import { button,clear,el,field } from '../../../core/ui.js';
let nextId=0;
export function createPlatformOwnerCustomerView({ controller,heading=null }={}) {
  if (!controller || ['snapshot','subscribe','approve','check','nextPage','firstPage','reauthenticate']
    .some(name=>typeof controller[name]!=='function')) throw new TypeError('PLATFORM_OWNER_CUSTOMER_VIEW_INVALID');
  const id=`platformOwnerCustomer${++nextId}`,element=el('section',{
    className: 'platform-admin-synthetic-workspace',attrs: { 'aria-labelledby': heading?.id ?? `${id}Title` } });let phase=null;
  function update(state=controller.snapshot()) {
    const active=document.activeElement,hadFocus=element.contains(active),focusId=active?.id,same=phase===state.phase;
    const tenantId=element.querySelector(`#${id}Tenant`)?.value,selectedRole=element.querySelector(`#${id}Role`)?.value;
    phase=state.phase;clear(element);
    const title=heading ?? el('h3',{ id: `${id}Title`,text: t('platformOwnerCustomer.title'),attrs: { tabindex: '-1' } });
    if (!heading) element.append(title);
    element.append(el('p',{ text: t('platformOwnerCustomer.disclosure') }),el('p',{
      text: t(`platformOwnerCustomer.phase.${state.phase}`),attrs: { role: 'status','aria-live': 'polite' } }));
    if (state.error) element.append(el('p',{ text: t(`platformOwnerCustomer.error.${state.error}`),attrs: { role: 'alert' } }));
    const actions=[];
    function action(key,method) {
      const control=method==='reauthenticate'
        ? microsoftSignInControl({ label: t('platformAdmin.session.signIn'),id: `${id}${method}` })
        : button(t(key),{ id: `${id}${method}`,className: 'secondary' });
      control.addEventListener('click',()=>{ void controller[method](); });actions.push(control);
    }
    const directory=state.directory;
    if (state.phase==='ready' && directory) {
      if (!directory.pending) element.append(el('p',{ text: t('platformOwnerCustomer.noIntent') }),el('a',{
        text: t('platformOwnerCustomer.start'),attrs: { href: directory.customerStartUrl } }));
      else if (directory.tenants.length) {
        const choose=()=>el('option',{ value: '',text: t('platformOwnerCustomer.choose'),attrs: { disabled: '',selected: '' } });
        const tenant=el('select',{ id: `${id}Tenant`,attrs: { required: '' } },[choose(),
          ...directory.tenants.map(value=>el('option',{ value: value.tenantId,text: value.displayName }))]);
        const role=el('select',{ id: `${id}Role`,attrs: { required: '' } },[choose(),
          ...['employee','conference_manager','tenant_admin'].map(value=>el('option',{
            value,text: t(`customerOwnerHandoff.role.${value}`) }))]);
        if (directory.tenants.some(value=>value.tenantId===tenantId)) tenant.value=tenantId;
        if (['employee','conference_manager','tenant_admin'].includes(selectedRole)) role.value=selectedRole;
        const form=el('form',{},[field({ id: `${id}Tenant`,label: t('platformOwnerCustomer.customer'),control: tenant }),
          field({ id: `${id}Role`,label: t('platformOwnerCustomer.role'),control: role }),
          button(t('platformOwnerCustomer.approve'),{ type: 'submit',className: 'primary' })]);
        form.addEventListener('submit',event=>{ event.preventDefault();void controller.approve({ tenantId: tenant.value,role: role.value }); });
        element.append(form);
      } else element.append(el('p',{ text: t('platformOwnerCustomer.empty') }));
      if (directory.pending) action('platformOwnerCustomer.firstPage','firstPage');
      if (directory.nextTenantId) action('platformOwnerCustomer.nextPage','nextPage');
    }
    if (['ready','check_required','continuing'].includes(state.phase)) action('platformOwnerCustomer.check','check');
    if (state.phase==='reauthentication_required') action('platformOwnerCustomer.reauthenticate','reauthenticate');
    if (actions.length) element.append(el('div',{ className: 'button-row' },actions));
    if (hadFocus) ((same && focusId ? element.querySelector(`#${focusId}`) : null) || title).focus();
  }
  const unsubscribe=controller.subscribe(update);update();
  return Object.freeze({ element,update,dispose() { unsubscribe(); } });
}

import { microsoftSignInControl } from '../../../core/microsoft-sign-in-control.js';
import { formatDateTime,formatNumber,t } from '../../../core/i18n.js';
import { button,clear,el,field } from '../../../core/ui.js';
let nextId=0;
export function createPlatformSyntheticWorkspaceView({ controller,onTenant,heading=null }={}) {
  if (!controller || ['snapshot','subscribe','prepareReplacement','cancelReplacement','replace','approve','check','reauthenticate']
    .some(name=>typeof controller[name]!=='function') || typeof onTenant!=='function') {
    throw new TypeError('PLATFORM_SYNTHETIC_VIEW_INVALID');
  }
  const id=`platformSynthetic${++nextId}`,element=el('section',{ className: 'platform-admin-synthetic-workspace',attrs: { 'aria-labelledby': heading?.id ?? `${id}Title` } });
  let phase=null;
  function update(state=controller.snapshot()) {
    const active=document.activeElement,hadFocus=element.contains(active),focusId=active?.id,same=phase===state.phase;
    const selectedSlot=element.querySelector(`#${id}Slot`)?.value ?? '',selectedRole=element.querySelector(`#${id}Role`)?.value ?? '';
    const guideOpen=element.querySelector(`#${id}Guide`)?.open===true;
    phase=state.phase;clear(element);
    const title=heading ?? el('h3',{ id: `${id}Title`,text: t('platformSynthetic.title'),attrs: { tabindex: '-1' } });
    if (!heading) element.append(title);
    element.append(el('p',{ text: t('platformSynthetic.disclosure') }));
    const guide=el('details',{ id: `${id}Guide`,dataset: { syntheticEntryGuide: 'true' } },[
      el('summary',{ id: `${id}GuideSummary`,text: t('platformSynthetic.guide.title') }),
      el('ol',{},['create','start','approve','participants','reset'].map(step=>el('li',{ text: t(`platformSynthetic.guide.${step}`) }))),
    ]);
    guide.open=guideOpen;element.append(guide);
    element.append(el('p',{ text: t(`platformSynthetic.phase.${state.phase}`),attrs: { role: 'status','aria-live': 'polite' } }));
    if (state.error) element.append(el('p',{ text: t(`platformSynthetic.error.${state.error}`),attrs: { role: 'alert' } }));
    const actions=[];
    function action(key,method,primary=false) {
      const control=method==='reauthenticate'
        ? microsoftSignInControl({ label: t('platformAdmin.session.signIn'),id: `${id}${method}` })
        : button(t(key),{ id: `${id}${method}`,className: primary ? 'primary' : 'secondary' });
      control.addEventListener('click',()=>{ void controller[method](); });actions.push(control);
    }
    if (state.phase==='replacement_confirmation') {
      element.append(el('p',{ text: t(state.directory?.generation ? 'platformSynthetic.resetWarning' : 'platformSynthetic.createWarning') }));
      action(state.directory?.generation ? 'platformSynthetic.confirmReset' : 'platformSynthetic.confirmCreate','replace',true);
      action('common.cancel','cancelReplacement');
    } else {
      const view=state.directory;
      if (view) {
        element.append(el('p',{ text: t('platformSynthetic.retained',{ count: formatNumber(view.retainedGenerations) }) }));
        if (view.retainedGenerations===32) element.append(el('p',{ text: t('platformSynthetic.limit') }));
        if (view.replaceAfter) element.append(el('p',{ text: t('platformSynthetic.cooldown',{ time: formatDateTime(view.replaceAfter) }) }));
        if (view.generation) {
          const list=el('ul');
          for (const tenant of view.generation.tenants) {
            const entry=el('li',{},[el('span',{ text: t('platformSynthetic.tenantState',{
              organisation: t(`platformSynthetic.slot.${tenant.slot}`),status: t(`platformAdmin.filter.lifecycle.${tenant.status}`) }) })]);
            if (state.phase==='ready' && view.generation.available) {
              const control=button(t('platformSynthetic.manage',{ organisation: t(`platformSynthetic.slot.${tenant.slot}`) }));
              control.addEventListener('click',()=>onTenant(tenant.tenantId));entry.append(control);
            }
            list.append(entry);
          }
          element.append(list);
          if (!view.generation.available) element.append(el('p',{ text: t('platformSynthetic.stale') }));
        } else element.append(el('p',{ text: t('platformSynthetic.empty') }));
        if (state.phase==='ready' && view.canReplace) {
          action(view.generation ? 'platformSynthetic.reset' : 'platformSynthetic.create','prepareReplacement');
        }
      }
      if (state.phase==='ready' && state.pendingIntent && view?.generation?.available) {
        const slot=el('select',{ id: `${id}Slot`,attrs: { required: '' } },[
          el('option',{ value: '',text: t('platformSynthetic.choose'),attrs: { disabled: '',selected: '' } }),
          ...view.generation.tenants.map(tenant=>el('option',{ value: tenant.slot,text: t(`platformSynthetic.slot.${tenant.slot}`) })),
        ]);
        const role=el('select',{ id: `${id}Role`,attrs: { required: '' } },[
          el('option',{ value: '',text: t('platformSynthetic.choose'),attrs: { disabled: '',selected: '' } }),
          ...['employee','conference_manager','tenant_admin'].map(value=>el('option',{ value,text: t(`platformSynthetic.role.${value}`) })),
        ]);
        if (['northwind','contoso','fabrikam'].includes(selectedSlot)) slot.value=selectedSlot;
        if (['employee','conference_manager','tenant_admin'].includes(selectedRole)) role.value=selectedRole;
        const form=el('form',{},[field({ id: `${id}Slot`,label: t('platformSynthetic.organisation'),control: slot }),
          field({ id: `${id}Role`,label: t('platformSynthetic.role'),control: role }),
          button(t('platformSynthetic.approve'),{ type: 'submit',className: 'primary' })]);
        form.addEventListener('submit',event=>{ event.preventDefault();void controller.approve({ slot: slot.value,role: role.value }); });
        element.append(el('p',{ text: t('platformSynthetic.approvalScope') }),form);
      } else if (state.phase==='ready') element.append(el('p',{ text: t(state.pendingIntent ? 'platformSynthetic.generationRequired' : 'platformSynthetic.noIntent') }));
      if (['ready','check_required','continuing'].includes(state.phase)) action('platformSynthetic.check','check');
      if (state.phase==='reauthentication_required') action('platformSynthetic.reauthenticate','reauthenticate',true);
    }
    if (actions.length) element.append(el('div',{ className: 'button-row' },actions));
    if (hadFocus) ((same && focusId ? element.querySelector(`#${focusId}`) : null) || title).focus();
  }
  const unsubscribe=controller.subscribe(update);update();
  return Object.freeze({ element,update,dispose() { unsubscribe(); } });
}

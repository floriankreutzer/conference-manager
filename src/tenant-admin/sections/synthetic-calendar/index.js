import { formatNumber,t } from '../../../core/i18n.js';
import { announce,button,clear,el } from '../../../core/ui.js';
import { defineTenantAdminSection,TENANT_ADMIN_SECTION_PERMISSION } from '../../section-contract.js';

const TITLE='syntheticOnboarding.title';
function errorKey(error,mutation=false) {
  if (['HTTP_401','SESSION_EXPIRED','SESSION_REVOKED'].includes(error?.code)) return 'syntheticOnboarding.error.session';
  if (['HTTP_403','AUTHORIZATION_DENIED','SYNTHETIC_ONBOARDING_AUTHORITY_DENIED'].includes(error?.code)) {
    return 'syntheticOnboarding.error.forbidden';
  }
  if (['HTTP_409','SYNTHETIC_ONBOARDING_CONFLICT'].includes(error?.code)) return 'syntheticOnboarding.error.conflict';
  return mutation ? 'syntheticOnboarding.error.checkRequired' : 'syntheticOnboarding.error.unavailable';
}
export function createSyntheticCalendarSection({ adapter=null }={}) {
  if (adapter!==null && ['getView','importRooms','transition'].some(name=>typeof adapter[name]!=='function')) {
    throw new TypeError('SYNTHETIC_CALENDAR_SECTION_ADAPTER_INVALID');
  }
  const selectedKeys=new Set();
  let feedback=null,focusAfterLoad=false,mutationPending=false,checkRequired=false;
  async function render({ root,isCurrent,rerender }) {
    clear(root);
    const heading=el('h2',{ text: t(TITLE),attrs: { tabindex: '-1' } });
    const status=el('p',{ text: t('syntheticOnboarding.loading'),attrs: { role: 'status','aria-live': 'polite','aria-atomic': 'true' } });
    root.append(el('section',{ className: 'card tenant-admin-intro tenant-synthetic-onboarding' },[heading,status]));
    try {
      const view=await adapter.getView();if (!isCurrent()) return;
      status.textContent=t('syntheticOnboarding.disclosure');
      const refresh=button(t('syntheticOnboarding.refresh'));
      refresh.addEventListener('click',()=>{ if (mutationPending) return;checkRequired=false;focusAfterLoad=true;rerender(); });
      const message=el('p',{ text: feedback ? t(feedback) : '',attrs: { role: 'status','aria-live': 'polite','aria-atomic': 'true' } });
      const actions=el('div',{ className: 'button-row' },[refresh]);
      root.append(el('section',{ className: 'card tenant-synthetic-onboarding',dataset: { syntheticOnboarding: 'true' } },[
        el('h3',{ text: t('syntheticOnboarding.readiness') }),
        el('p',{ text: t('syntheticOnboarding.status',{ status: t(`syntheticOnboarding.state.${view.tenantStatus}`),
          rooms: formatNumber(view.roomCount),bound: formatNumber(view.boundRoomCount) }) }),
        el('ul',{},Object.entries(view.readiness.checks).map(([key,ready])=>el('li',{
          text: t(`syntheticOnboarding.check.${key}`,{ state: t(ready ? 'syntheticOnboarding.ready' : 'syntheticOnboarding.blocked') }),
        }))),
        el('p',{ text: t(view.calendarWriteEntitled ? 'syntheticOnboarding.writeEnabled' : 'syntheticOnboarding.writeDisabled') }),
        actions,message,
      ]));
      const controls=[refresh];
      async function mutate(operation,success) {
        if (mutationPending || checkRequired || !isCurrent()) return;
        mutationPending=true;controls.forEach(control=>{ control.disabled=true; });message.textContent=t('syntheticOnboarding.saving');
        try {
          await operation();if (!isCurrent()) return;feedback=success;focusAfterLoad=true;rerender();
        } catch (error) {
          if (!isCurrent()) return;checkRequired=true;const key=errorKey(error,true);
          message.textContent=t(key);announce(t(key),{ assertive: true });refresh.disabled=false;refresh.focus();
        } finally { mutationPending=false; }
      }
      const available=view.candidates.filter(candidate=>!candidate.imported);
      for (const key of selectedKeys) if (!available.some(candidate=>candidate.key===key)) selectedKeys.delete(key);
      if (available.length) {
        const form=el('form',{ className: 'card tenant-synthetic-onboarding' }),fieldset=el('fieldset',{},[el('legend',{ text: t('syntheticOnboarding.selectRooms') })]);
        const inputs=available.map(candidate=>{
          const input=el('input',{ type: 'checkbox',value: candidate.key,checked: selectedKeys.has(candidate.key) });
          fieldset.append(el('label',{ className: 'field tenant-synthetic-room-choice' },[input,el('span',{ text: t('syntheticOnboarding.candidate',{
            name: candidate.name,capacity: formatNumber(candidate.capacity),building: candidate.building }) })]));
          controls.push(input);return input;
        });
        const submit=button(t('syntheticOnboarding.import'),{ type: 'submit',className: 'primary' });
        controls.push(submit);submit.disabled=!inputs.some(control=>control.checked);
        for (const input of inputs) input.addEventListener('change',()=>{
          if (input.checked) selectedKeys.add(input.value);else selectedKeys.delete(input.value);
          submit.disabled=mutationPending || checkRequired || !inputs.some(control=>control.checked);
        });
        form.addEventListener('submit',event=>{
          event.preventDefault();const selected=inputs.filter(input=>input.checked).map(input=>input.value);
          if (!selected.length) return;
          void mutate(()=>adapter.importRooms({ expectedRevision: view.locationsRevision,selectedKeys: selected }),
            'syntheticOnboarding.imported');
        });
        form.append(fieldset,el('div',{ className: 'button-row' },[submit]));root.append(form);
      }
      if (view.readiness.ready && view.tenantStatus!=='active') {
        const targetStatus=view.tenantStatus==='onboarding' ? 'ready' : 'active';
        const advance=button(t(targetStatus==='ready' ? 'syntheticOnboarding.markReady' : 'syntheticOnboarding.activate'),
          { className: 'primary' });controls.push(advance);
        advance.addEventListener('click',()=>{ void mutate(()=>adapter.transition({ expectedRevision: view.locationsRevision,
          expectedStatus: view.tenantStatus,targetStatus }),'syntheticOnboarding.advanced'); });actions.append(advance);
      }
      if (view.tenantStatus==='active') {
        const open=el('a',{ text: t('syntheticOnboarding.openApplication'),className: 'button primary',attrs: { href: '/' } });
        actions.append(open);
      }
      if (checkRequired) controls.forEach(control=>{ control.disabled=control!==refresh; });
      if (focusAfterLoad) { focusAfterLoad=false;heading.focus();announce(feedback ? t(feedback) : t('syntheticOnboarding.updated')); }
    } catch (error) {
      if (!isCurrent()) return;const key=errorKey(error);status.textContent=t(key);status.setAttribute('role','alert');status.setAttribute('aria-live','assertive');
      const retry=button(t('syntheticOnboarding.refresh'));retry.addEventListener('click',()=>{ focusAfterLoad=true;rerender(); });
      const reload=el('a',{ text: t('syntheticOnboarding.reload'),attrs: { href: '/' } });
      root.append(el('div',{ className: 'button-row' },[retry,reload]));announce(t(key),{ assertive: true });
    }
  }
  return defineTenantAdminSection({ id: 'synthetic-calendar',titleKey: TITLE,descriptionKey: 'syntheticOnboarding.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.INTEGRATIONS_MANAGE,available: adapter!==null,render });
}

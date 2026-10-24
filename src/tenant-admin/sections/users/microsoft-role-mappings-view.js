import { t,formatNumber } from '../../../core/i18n.js';
import { button,clear,el,field,announce,showToast } from '../../../core/ui.js';

const key=value=>`tenantAdmin.microsoftRoles.${value}`;
const GUID_PATTERN='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const ROLES=['conference_manager','tenant_admin'];
function errorKey(error) {
  if (error?.serverCode==='MICROSOFT_ROLE_DIRECT_ADMIN_REQUIRED') return key('directAdminRequired');
  if (error?.code==='HTTP_409') return key('conflict');
  if (['HTTP_400','MICROSOFT_ROLE_MAPPING_INPUT_INVALID'].includes(error?.code)) return key('invalid');
  if (['HTTP_401','HTTP_403'].includes(error?.code)) return 'tenantAdmin.users.errorSession';
  return key('error');
}
export function createMicrosoftRoleMappingsView({ client,draft,isCurrent=()=>true,onChanged=()=>{} }={}) {
  if (['get','replace'].some(name=>typeof client?.[name]!=='function') || !draft || typeof isCurrent!=='function') {
    throw new TypeError('MICROSOFT_ROLE_MAPPING_VIEW_REQUIRED');
  }
  let disposed=false,busy=false;
  const root=el('section',{ className: 'card tenant-admin-status',dataset: { microsoftRoleMappings: 'true' } });
  root.hidden=true;
  const heading=el('h3',{ text: t(key('title')),attrs: { tabindex: '-1' } });
  const form=el('form'),fields=el('fieldset',{ className: 'tenant-role-fieldset' });
  const directory=el('input',{ type: 'text',name: 'microsoft-role-directory',attrs: {
    required: '',maxlength: '36',pattern: GUID_PATTERN,autocomplete: 'off',spellcheck: 'false',
  } });
  const rows=el('div',{ className: 'tenant-user-grid' });
  const add=button(t(key('add'))),save=button(t('common.save'),{ type: 'submit',className: 'primary' });
  const refresh=button(t(key('reload')));
  const status=el('p',{ className: 'field-hint',attrs: { role: 'status','aria-live': 'polite','aria-atomic': 'true' } });
  fields.append(el('legend',{ text: t(key('settings')) }),
    field({ id: 'microsoft-role-directory',label: t(key('directory')),control: directory }),
    el('p',{ className: 'field-hint',text: t(key('effect')) }),rows,
    el('div',{ className: 'button-row' },[add,save,refresh]));
  form.append(fields);root.append(heading,el('p',{ text: t(key('description')) }),
    el('p',{ className: 'field-hint',text: t(key('expiry')) }),form,status);
  const active=()=>!disposed && isCurrent() && root.isConnected;
  const setBusy=value=>{
    busy=value;fields.disabled=value;save.disabled=!draft.initialized;
    add.disabled=!draft.initialized || draft.mappings.length>=100;
  };
  function adopt(settings) {
    draft.directoryId=settings.directoryId ?? '';draft.revision=settings.revision;draft.initialized=true;
    draft.mappings=settings.mappings.map(row=>({ groupId: row.groupId,roles: [...row.roles] }));
  }
  function renderRows(focusIndex=null) {
    clear(rows);directory.value=draft.directoryId;
    draft.mappings.forEach((entry,index)=>{
      const group=el('fieldset',{ className: 'tenant-role-fieldset' },[
        el('legend',{ text: t(key('mapping'),{ number: formatNumber(index+1) }) }),
      ]);
      const input=el('input',{ type: 'text',value: entry.groupId,name: `microsoft-role-group-${index}`,attrs: {
        required: '',maxlength: '36',pattern: GUID_PATTERN,autocomplete: 'off',spellcheck: 'false',
      } });
      input.addEventListener('input',()=>{ entry.groupId=input.value; });
      group.append(field({ id: `microsoft-role-group-${index}`,label: t(key('group')),control: input }));
      for (const role of ROLES) {
        const control=el('input',{ type: 'checkbox',checked: entry.roles.includes(role),name: `microsoft-role-${role}-${index}` });
        control.addEventListener('change',()=>{
          entry.roles=control.checked ? [...entry.roles,role] : entry.roles.filter(value=>value!==role);
        });
        group.append(el('label',{ className: 'tenant-role-option' },[control,el('span',{
          text: t(role==='conference_manager' ? 'tenantAdmin.users.roleConferenceManager' : 'tenantAdmin.users.roleTenantAdmin'),
        })]));
      }
      const remove=button(t(key('remove'),{ number: formatNumber(index+1) }));
      remove.addEventListener('click',()=>{
        if (!active() || busy) return;draft.mappings.splice(index,1);renderRows(Math.min(index,draft.mappings.length-1));
        if (!draft.mappings.length) add.focus();
      });group.append(remove);rows.append(group);
    });
    add.disabled=draft.mappings.length>=100;
    if (focusIndex!==null && focusIndex>=0) rows.querySelectorAll('input[type="text"]')[focusIndex]?.focus();
  }
  async function load(replaceDraft=false) {
    if (busy || disposed) return;setBusy(true);status.textContent=t(key('loading'));
    try {
      const settings=await client.get();if (!active()) return;
      root.hidden=false;
      if (!draft.initialized || replaceDraft) adopt(settings);
      renderRows();status.textContent=settings.revision===draft.revision ? '' : t(key('conflict'));
    } catch (error) {
      if (!active()) return;
      if (['HTTP_403','HTTP_404'].includes(error?.code)) { root.hidden=true;return; }
      root.hidden=false;
      status.textContent=t(errorKey(error));
    } finally { if (active()) setBusy(false); }
  }
  directory.addEventListener('input',()=>{ draft.directoryId=directory.value; });
  add.addEventListener('click',()=>{
    if (!active() || busy || draft.mappings.length>=100) return;
    draft.mappings.push({ groupId: '',roles: [] });renderRows(draft.mappings.length-1);
  });
  refresh.addEventListener('click',()=>void load(true));
  form.addEventListener('submit',async event=>{
    event.preventDefault();if (!active() || busy || !draft.initialized) return;
    setBusy(true);status.textContent=t(key('saving'));
    try {
      const result=await client.replace({ directoryId: draft.directoryId,expectedRevision: draft.revision,
        mappings: draft.mappings.map(row=>({ groupId: row.groupId,roles: [...row.roles] })) });
      if (!active()) return;adopt(result);renderRows();
      showToast(t(key('saved')));announce(t(key('saved')));onChanged();
    } catch (error) {
      if (!active()) return;setBusy(false);
      status.textContent=t(errorKey(error));announce(status.textContent,{ assertive: true });save.focus();
    } finally { if (active()) setBusy(false); }
  });
  return Object.freeze({ element: root,load,dispose() { disposed=true; } });
}

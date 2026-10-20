import { t,language,formatDateTime,formatNumber } from '../../../core/i18n.js';
import { button,clear,el,field } from '../../../core/ui.js';

const blank=() => ({ recipient: '',roles: [],locale: language() });
const key=value => `tenantInvitations.${value}`;
export function createInvitationAdministrationView({ controller,draft,isCurrent=() => true } = {}) {
  if (!controller || typeof controller.subscribe!=='function' || !Array.isArray(draft)) {
    throw new TypeError('CUSTOMER_INVITATION_VIEW_CONFIGURATION_INVALID');
  }
  if (!draft.length) draft.push(blank());
  const root=el('section',{ className: 'tenant-user-grid tenant-invitation-administration' });
  const heading=el('h2',{ text: t(key('title')),attrs: { tabindex: '-1' } });
  const form=el('form',{ className: 'card tenant-operations-filter' });
  const fields=el('fieldset',{ className: 'tenant-role-fieldset' });
  const rows=el('div',{ className: 'tenant-user-grid' });
  let focusResult=false,submitted=false;
  const add=button(t(key('add'))),submit=button(t(key('issue')),{ type: 'submit',className: 'primary' });
  fields.append(el('legend',{ text: t(key('new')) }),rows,el('div',{ className: 'button-row' },[add,submit]));
  form.append(fields);
  const status=el('div',{ attrs: { tabindex: '-1' } }),results=el('div',{ className: 'tenant-user-grid' });
  root.append(el('section',{ className: 'card tenant-admin-intro' },[heading,el('p',{ text: t(key('description')) })]),
    form,status,results);
  function renderRows(focusIndex=null) {
    clear(rows);
    draft.forEach((entry,index) => {
      const group=el('fieldset',{ className: 'tenant-role-fieldset' },[
        el('legend',{ text: t(key('person'),{ number: formatNumber(index+1) }) }),
      ]);
      const recipient=el('input',{ type: 'email',value: entry.recipient,name: `invite-recipient-${index}`,
        attrs: { required: '',maxlength: '254',autocomplete: 'email' } });
      recipient.addEventListener('input',() => { entry.recipient=recipient.value; });
      group.append(field({ id: `invite-recipient-${index}`,label: t(key('recipient')),control: recipient }),
        el('p',{ className: 'field-hint',text: t('tenantAdmin.users.employeeBaseline') }));
      for (const role of ['conference_manager','tenant_admin']) {
        const control=el('input',{ type: 'checkbox',checked: entry.roles.includes(role),name: `invite-${role}-${index}` });
        control.addEventListener('change',() => {
          entry.roles=control.checked ? [...entry.roles,role] : entry.roles.filter(value => value!==role);
        });
        group.append(el('label',{ className: 'tenant-role-option' },[control,el('span',{
          text: t(role==='tenant_admin' ? 'tenantAdmin.users.roleTenantAdmin' : 'tenantAdmin.users.roleConferenceManager'),
        })]));
      }
      const locale=el('select',{ name: `invite-language-${index}` });
      for (const value of ['de','en']) locale.append(el('option',{ value,text: t(`customerAuth.language.${value}`) }));
      locale.value=entry.locale;locale.addEventListener('change',() => { entry.locale=locale.value; });
      group.append(field({ id: `invite-language-${index}`,label: t(key('locale')),control: locale }));
      const remove=button(t(key('remove'),{ number: formatNumber(index+1) }),{ disabled: draft.length===1 });
      remove.addEventListener('click',() => { draft.splice(index,1);renderRows(Math.max(0,index-1)); });
      group.append(remove);rows.append(group);
    });
    add.disabled=draft.length>=20;
    if (focusIndex!==null) rows.querySelectorAll('input[type="email"]')[focusIndex]?.focus();
  }
  add.addEventListener('click',() => { if (draft.length<20) { draft.push(blank());renderRows(draft.length-1); } });
  form.addEventListener('submit',event => {
    event.preventDefault();if (!form.reportValidity()) return;submitted=true;focusResult=true;
    void controller.issue(draft);
  });
  function action(label,run) {
    const control=button(t(key(label)));control.addEventListener('click',() => { focusResult=true;void run(); });return control;
  }
  function render(state) {
    if (!isCurrent()) return;
    fields.disabled=!['ready','error'].includes(state.status) || state.error==='authority';
    if (submitted && state.status==='ready') { draft.splice(0,draft.length,blank());renderRows();submitted=false; }
    if (state.status==='error') submitted=false;
    clear(status);clear(results);
    status.setAttribute('role',state.error ? 'alert' : 'status');
    status.append(el('p',{ text: t(key(state.error ? `error.${state.error}` : `status.${state.status}`)) }));
    if (state.status==='retry_batch') status.append(action('retryBatch',() => controller.retryBatch()));
    if (['refresh_required','error','ready','retry_batch'].includes(state.status)) {
      status.append(action('refresh',() => controller.load()));
    }
    if (state.items.length===0 && state.status==='ready') results.append(el('p',{ text: t(key('empty')) }));
    for (const item of state.items) {
      const headingId=`invitation-${item.id}`;
      const card=el('article',{ className: 'card tenant-operations-user-card',attrs: { 'aria-labelledby': headingId } },[
        el('h3',{ id: headingId,text: item.recipient }),el('p',{ text: t(key(`state.${item.state}`)) }),
        el('p',{ text: t(key(`delivery.${item.delivery}`)) }),
        el('p',{ text: t(key('expires'),{ time: formatDateTime(item.expiresAt) }) }),
      ]);
      const roles=item.roles.map(role => t(role==='tenant_admin' ? 'tenantAdmin.users.roleTenantAdmin'
        : 'tenantAdmin.users.roleConferenceManager'));
      card.append(el('p',{ text: roles.length ? roles.join(', ') : t('tenantAdmin.operations.users.role.employeeOnly') }));
      if (['pending','expired'].includes(item.state)) {
        const controls=['reissue','revoke'].map(operation => {
          const control=action(operation,() => controller.mutate(operation,item.id));control.disabled=state.status!=='ready';
          control.setAttribute('aria-label',t(key(`${operation}For`),{ recipient: item.recipient }));
          return control;
        });card.append(el('div',{ className: 'button-row' },controls));
      }
      results.append(card);
    }
    const pages=[];
    if (state.afterId!==null) pages.push(action('first',() => controller.load({ afterId: null })));
    if (state.hasNext) pages.push(action('next',() => controller.load({ afterId: state.items.at(-1).id })));
    if (pages.length) results.append(el('div',{ className: 'button-row' },pages));
    if (focusResult) { (state.status==='loading' ? status : heading).focus();if (state.status!=='loading') focusResult=false; }
  }
  renderRows();const unsubscribe=controller.subscribe(render);render(controller.snapshot());
  return Object.freeze({ element: root,dispose: unsubscribe });
}

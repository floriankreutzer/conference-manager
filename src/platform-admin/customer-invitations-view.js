import { t,language,formatDateTime,formatNumber } from '../core/i18n.js';
import { button,clear,el,field,openDialog } from '../core/ui.js';

const key=value=>`platformInvitations.${value}`;
const blank=()=>({ recipient: '',roles: [],locale: language() });
export function createPlatformInvitationView({ controller,draft,creation=false,isCurrent=()=>true }={}) {
  if (typeof controller?.subscribe!=='function' || !draft || !Array.isArray(draft.invitations)) {
    throw new TypeError('PLATFORM_INVITATION_VIEW_INVALID');
  }
  const root=el('section',{ className: 'platform-admin-invitations' }),heading=el('h3',{
    text: t(key(creation ? 'createTitle' : 'title')),attrs: { tabindex: '-1' } });
  const form=el('form',{ className: 'card platform-admin-invitation-form' }),fields=el('fieldset');
  const people=el('div',{ className: 'platform-admin-invitation-people' });
  const status=el('div',{ attrs: { tabindex: '-1' } }),results=el('div',{ className: 'platform-admin-invitation-results' });
  const name=creation ? el('input',{ type: 'text',value: draft.displayName ?? '',attrs: { required: '',maxlength: '160',autocomplete: 'off' } }) : null;
  const reason=el('textarea',{ value: draft.reason ?? '',attrs: { required: '',maxlength: '500',rows: '3' } });
  const confirmation=creation ? el('input',{ type: 'text',value: draft.confirmation ?? '',
    attrs: { required: '',maxlength: '160',autocomplete: 'off' } }) : null;
  let disposed=false,focusResult=false,submitted=false,mutationDialog=null;
  fields.append(el('legend',{ text: t(key('new')) }));
  if (name) { fields.append(field({ id: 'platformInviteName',label: t('platformAdmin.create.displayName'),control: name,required: true }));
    name.addEventListener('input',()=>{ draft.displayName=name.value; }); }
  fields.append(people);
  const add=button(t(key('add'))),submit=button(t(key(creation ? 'create' : 'issue')),{ type: 'submit',className: 'primary' });
  fields.append(el('div',{ className: 'button-row' },[add]),field({ id: 'platformInviteReason',
    label: t('platformAdmin.action.reason'),control: reason,required: true }));
  reason.addEventListener('input',()=>{ draft.reason=reason.value; });
  if (confirmation) fields.append(field({ id: 'platformInviteConfirmName',label: t('platformAdmin.create.confirmation'),
    hint: t('platformAdmin.create.confirmationHint'),control: confirmation,required: true }));
  confirmation?.addEventListener('input',()=>{ draft.confirmation=confirmation.value; });
  fields.append(el('div',{ className: 'button-row' },[submit]));form.append(fields);
  root.append(heading,el('p',{ text: t(key(creation ? 'ownerNote' : 'description')) }),
    el('p',{ text: t('platformAdmin.passkey.operationNote') }),form,status,results);
  function current() { return !disposed && isCurrent(); }
  function renderPeople(focusIndex=null) {
    clear(people);
    draft.invitations.forEach((entry,index)=>{
      const person=el('fieldset',{ className: 'platform-admin-invitation-person' },[
        el('legend',{ text: t(key('person'),{ number: formatNumber(index+1) }) }),
      ]);
      const recipient=el('input',{ type: 'email',value: entry.recipient,attrs: { required: '',maxlength: '254',autocomplete: 'email' } });
      recipient.addEventListener('input',()=>{ entry.recipient=recipient.value; });
      person.append(field({ id: `platformInviteRecipient${index}`,label: t(key('recipient')),control: recipient,required: true }),
        el('p',{ className: 'field-hint',text: t(key('employee')) }));
      for (const role of ['conference_manager','tenant_admin']) {
        const control=el('input',{ type: 'checkbox',checked: entry.roles.includes(role) });
        control.addEventListener('change',()=>{ entry.roles=control.checked ? [...entry.roles,role] : entry.roles.filter(value=>value!==role); });
        person.append(el('label',{ className: 'platform-admin-entitlement-option' },[control,el('span',{ text: t(key(`role.${role}`)) })]));
      }
      const locale=el('select');
      for (const value of ['de','en']) locale.append(el('option',{ value,text: t(`platformAdmin.language.${value}`) }));
      locale.value=entry.locale;locale.addEventListener('change',()=>{ entry.locale=locale.value; });
      person.append(field({ id: `platformInviteLocale${index}`,label: t(key('locale')),control: locale }));
      const remove=button(t(key('remove'),{ number: formatNumber(index+1) }));
      remove.addEventListener('click',()=>{ draft.invitations.splice(index,1);renderPeople(Math.min(index,draft.invitations.length-1));
        if (!draft.invitations.length) add.focus(); });person.append(remove);people.append(person);
    });
    add.disabled=draft.invitations.length>=(creation ? 19 : 20);
    if (focusIndex!==null) people.querySelectorAll('input[type="email"]')[focusIndex]?.focus();
  }
  add.addEventListener('click',()=>{
    if (draft.invitations.length<(creation ? 19 : 20)) { draft.invitations.push(blank());renderPeople(draft.invitations.length-1); }
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();if (!current() || !form.reportValidity()) return;
    if ((!creation && !draft.invitations.length) || creation && confirmation.value!==name.value.trim()) {
      status.setAttribute('role','alert');status.textContent=t(key('validation'));
      (confirmation ?? add).focus();return;
    }
    submitted=true;focusResult=true;
    void controller.issue({ ...(creation ? { displayName: name.value.trim() } : {}),reason: reason.value.trim(),invitations: draft.invitations });
  });
  function action(label,run) {
    const control=button(t(key(label)));control.addEventListener('click',()=>{ focusResult=true;void run(); });return control;
  }
  function confirmMutation(operation,item) {
    if (mutationDialog || !current()) return;
    const auditReason=el('textarea',{ attrs: { required: '',maxlength: '500',rows: '3' } });
    const confirm=button(t(key(operation)),{ className: operation==='revoke' ? 'danger' : 'primary',type: 'submit' });
    const cancel=button(t('common.cancel'),{ className: 'secondary' });
    const confirmationForm=el('form',{},[el('p',{ text: t(key(`${operation}For`),{ recipient: item.recipient }) }),
      field({ id: 'platformInviteMutationReason',label: t('platformAdmin.action.reason'),control: auditReason,required: true }),
      el('div',{ className: 'button-row' },[confirm])]);
    mutationDialog=openDialog({ title: t(key(operation)),description: t(key(`${operation}Effect`)),content: confirmationForm,
      actions: [cancel],labelledById: 'platformInvitationMutationTitle' });
    const dialog=mutationDialog;cancel.addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{ mutationDialog=null; },{ once: true });
    confirmationForm.addEventListener('submit',event=>{
      event.preventDefault();if (!current() || !confirmationForm.reportValidity() || !auditReason.value.trim()) return;
      const value=auditReason.value.trim();dialog.close();focusResult=true;void controller.mutate(operation,item.id,value);
    });
  }
  function render(state) {
    if (!current()) return;
    fields.disabled=!['ready','error'].includes(state.status) || state.error==='authority';
    if (submitted && state.status==='ready') { draft.invitations.splice(0);draft.reason='';reason.value='';renderPeople();submitted=false; }
    if (state.status==='error') submitted=false;
    clear(status);clear(results);status.setAttribute('role',state.error ? 'alert' : 'status');
    status.append(el('p',{ text: t(key(state.error ? `error.${state.error}` : `status.${state.status}`)) }));
    if (state.status==='retry') status.append(action('retry',()=>controller.retry()));
    if (!creation && ['idle','ready','error','refresh_required','retry'].includes(state.status)) status.append(action('refresh',()=>controller.load()));
    if (!state.items.length && state.status==='ready' && !creation) results.append(el('p',{ text: t(key('empty')) }));
    for (const item of state.items) {
      const titleId=`platform-invitation-${item.id}`;
      const card=el('article',{ className: 'card platform-admin-invitation-record',attrs: { 'aria-labelledby': titleId } },[
        el('h4',{ id: titleId,text: item.recipient }),el('p',{ text: t(key(`state.${item.state}`)) }),
        el('p',{ text: t(key(`delivery.${item.delivery}`)) }),
        el('p',{ text: t(key('expires'),{ time: formatDateTime(item.expiresAt) }) }),
        el('p',{ text: item.roles.length ? item.roles.map(role=>t(key(`role.${role}`))).join(', ') : t(key('employee')) }),
      ]);
      if (!creation && ['pending','expired'].includes(item.state)) {
        const controls=['reissue','revoke'].map(operation=>{
          const control=button(t(key(operation)),{ disabled: state.status!=='ready',attrs: {
            'aria-label': t(key(`${operation}For`),{ recipient: item.recipient }) } });
          control.addEventListener('click',()=>confirmMutation(operation,item));return control;
        });card.append(el('div',{ className: 'button-row' },controls));
      }
      results.append(card);
    }
    if (!creation && state.status==='ready') {
      const pages=[];
      if (state.afterId!==null) pages.push(action('first',()=>controller.load({ afterId: null })));
      if (state.hasNext) pages.push(action('next',()=>controller.load({ afterId: state.items.at(-1).id })));
      if (pages.length) results.append(el('div',{ className: 'button-row' },pages));
    }
    if (focusResult) { (state.status==='loading' ? status : heading).focus();if (state.status!=='loading') focusResult=false; }
  }
  renderPeople();const unsubscribe=controller.subscribe(render);render(controller.snapshot());
  return Object.freeze({ element: root,dispose() { disposed=true;unsubscribe();mutationDialog?.close(); } });
}

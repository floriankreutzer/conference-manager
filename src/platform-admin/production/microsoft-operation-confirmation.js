import { microsoftSignInControl } from '../../core/microsoft-sign-in-control.js';
import { announce,button,el,openDialog } from '../../core/ui.js';
import { t } from '../../core/i18n.js';

function operationContextSummary(context) {
  const key=value=>`platformAdmin.microsoftOperation.context.${value}`;
  const rows=['action','target',...(context?.role ? ['role'] : []),...(context?.recoveryId ? ['procedure'] : [])]
    .map(label=>({ label,term: el('dt'),value: el('dd') }));
  const list=el('dl',{ className: 'platform-admin-definition-list' },rows.map(row=>el('div',{},[row.term,row.value])));
  const element=el('div',{ dataset: { microsoftOperationContext: 'true' } },[list]);
  const technicalLabel=el('summary');
  if (context?.tenantId) element.append(el('details',{},[technicalLabel,el('p',{ text: context.tenantId })]));
  function update() {
    const values={ action: t(key(context?.action ?? 'operation')),
      target: context?.displayName ?? (context?.slot ? t(`platformSynthetic.slot.${context.slot}`) : t(key(context?.target ?? 'platform'))),
      role: context?.role ? t(`platformSynthetic.role.${context.role}`) : '',
      procedure: context?.recoveryId ? t(`platformAdmin.recovery.action.${context.recoveryId}`) : '' };
    for (const row of rows) { row.term.textContent=t(key(row.label));row.value.textContent=values[row.label]; }
    technicalLabel.textContent=t(key('details'));
  }
  return { element,update };
}

// Only an explicit native link click opens the isolated provider tab. A bounded
// status port observes server custody; no opener/message/storage grants proof.
export function confirmPlatformMicrosoftOperation(pending,{ signal,readStatus,context=null }={}) {
  return new Promise((resolve,reject)=>{
    const controller=new AbortController(),deadline=Date.now()+115000;
    let settled=false,polling=false,timer,dialog,polls=0;
    const cancelled=()=>Object.assign(new Error('PLATFORM_MICROSOFT_OPERATION_CANCELLED'),{ code: 'PLATFORM_MICROSOFT_OPERATION_CANCELLED' });
    const failed=()=>Object.assign(new Error('PLATFORM_MICROSOFT_OPERATION_FAILED'),{ code: 'PLATFORM_MICROSOFT_OPERATION_FAILED' });
    const link=microsoftSignInControl({ label: t('platformAdmin.microsoftOperation.open'),href: pending.authorizationUrl,
      attrs: { target: '_blank',rel: 'noopener noreferrer' } });
    const status=el('p',{ attrs: { role: 'status','aria-live': 'polite' } });
    const summary=operationContextSummary(context);
    const cancel=button('',{ className: 'secondary' });
    function update() {
      summary.update();
      link.querySelector('span').textContent=t('platformAdmin.microsoftOperation.open');cancel.textContent=t('platformAdmin.microsoftOperation.cancel');
      if (dialog) {
        dialog.querySelector('h2').textContent=t('platformAdmin.microsoftOperation.title');
        dialog.querySelector('.modal-header p').textContent=t('platformAdmin.microsoftOperation.description');
      }
      status.textContent=polling ? t('platformAdmin.microsoftOperation.waiting') : '';
    }
    function finish(error) {
      if (settled) return;settled=true;controller.abort();clearTimeout(timer);
      signal?.removeEventListener('abort',abort);window.removeEventListener('conference-language-changed',update);
      dialog?.close();if (error) {
        announce(t(error.code==='PLATFORM_MICROSOFT_OPERATION_CANCELLED'
          ? 'platformAdmin.passkey.error.cancelled' : 'platformAdmin.microsoftOperation.failed'));reject(error);
      } else resolve();
    }
    const abort=()=>finish(cancelled());
    async function poll() {
      try {
        if (controller.signal.aborted) return;
        if (Date.now()>=deadline || ++polls>60) throw failed();
        const result=await readStatus({ signal: controller.signal });
        if (controller.signal.aborted) return;
        if (Date.now()>=deadline) throw failed();
        if (result==='verified') { finish();return; }
        if (result!=='pending') throw failed();
        timer=setTimeout(poll,2000);
      } catch { finish(failed()); }
    }
    if (signal?.aborted) { finish(cancelled());return; }
    if (typeof readStatus!=='function') { finish(failed());return; }
    cancel.addEventListener('click',abort);
    dialog=openDialog({ title: t('platformAdmin.microsoftOperation.title'),
      description: t('platformAdmin.microsoftOperation.description'),content: el('div',{},[summary.element,link,status]),
      actions: [cancel],labelledById: 'platformMicrosoftOperationTitle' });
    dialog.addEventListener('close',()=>{ if (!settled) finish(cancelled()); },{ once: true });
    link.addEventListener('click',event=>{
      if (polling) { event.preventDefault();return; }
      polling=true;link.setAttribute('aria-disabled','true');link.tabIndex=-1;
      clearTimeout(timer);update();timer=setTimeout(poll,1000);
    });
    signal?.addEventListener('abort',abort,{ once: true });window.addEventListener('conference-language-changed',update);
    timer=setTimeout(()=>finish(failed()),115000);update();
  });
}

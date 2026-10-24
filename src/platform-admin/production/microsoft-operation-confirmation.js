import { announce,button,el,openDialog } from '../../core/ui.js';
import { t } from '../../core/i18n.js';

// Only an explicit native link click opens the isolated provider tab. A bounded
// status port observes server custody; no opener/message/storage grants proof.
export function confirmPlatformMicrosoftOperation(pending,{ signal,readStatus }={}) {
  return new Promise((resolve,reject)=>{
    const controller=new AbortController(),deadline=Date.now()+115000;
    let settled=false,polling=false,timer,dialog,polls=0;
    const cancelled=()=>Object.assign(new Error('PLATFORM_MICROSOFT_OPERATION_CANCELLED'),{ code: 'PLATFORM_MICROSOFT_OPERATION_CANCELLED' });
    const link=el('a',{ className: 'btn primary',href: pending.authorizationUrl,target: '_blank',rel: 'noopener noreferrer' });
    const status=el('p',{ attrs: { role: 'status','aria-live': 'polite' } });
    const cancel=button('',{ className: 'secondary' });
    function update() {
      link.textContent=t('platformAdmin.microsoftOperation.open');cancel.textContent=t('platformAdmin.microsoftOperation.cancel');
      if (dialog) {
        dialog.querySelector('h2').textContent=t('platformAdmin.microsoftOperation.title');
        dialog.querySelector('.modal-header p').textContent=t('platformAdmin.microsoftOperation.description');
      }
      status.textContent=polling ? t('platformAdmin.microsoftOperation.waiting') : '';
    }
    function finish(error) {
      if (settled) return;settled=true;controller.abort();clearTimeout(timer);
      signal?.removeEventListener('abort',abort);window.removeEventListener('conference-language-changed',update);
      dialog?.close();if (error) { announce(t('platformAdmin.microsoftOperation.failed'));reject(error); } else resolve();
    }
    const abort=()=>finish(cancelled());
    async function poll() {
      try {
        if (controller.signal.aborted || Date.now()>=deadline || ++polls>60) throw cancelled();
        const result=await readStatus({ signal: controller.signal });
        if (controller.signal.aborted || Date.now()>=deadline) throw cancelled();
        if (result==='verified') { finish();return; }
        if (result!=='pending') throw cancelled();
        timer=setTimeout(poll,2000);
      } catch { finish(cancelled()); }
    }
    if (typeof readStatus!=='function' || signal?.aborted) { finish(cancelled());return; }
    cancel.addEventListener('click',abort);
    dialog=openDialog({ title: t('platformAdmin.microsoftOperation.title'),
      description: t('platformAdmin.microsoftOperation.description'),content: el('div',{},[link,status]),
      actions: [cancel],labelledById: 'platformMicrosoftOperationTitle' });
    dialog.addEventListener('close',()=>{ if (!settled) finish(cancelled()); },{ once: true });
    link.addEventListener('click',event=>{
      if (polling) { event.preventDefault();return; }
      polling=true;link.setAttribute('aria-disabled','true');link.tabIndex=-1;
      clearTimeout(timer);update();timer=setTimeout(poll,1000);
    });
    signal?.addEventListener('abort',abort,{ once: true });window.addEventListener('conference-language-changed',update);
    timer=setTimeout(abort,115000);update();
  });
}

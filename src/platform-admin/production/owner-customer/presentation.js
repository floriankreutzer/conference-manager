import { t } from '../../../core/i18n.js';
import { button,el,openDialog } from '../../../core/ui.js';
import { createPlatformOwnerCustomerController } from './controller.js';
import { createPlatformOwnerCustomerView } from './view.js';

// Production-only presentation port. It consumes fixed owned API/session/proof
// adapters; the button, signed intent hint and local state grant no permission.
export function createPlatformOwnerCustomerPresentation({ apiFactory,windowRef=globalThis.window }={}) {
  if (typeof apiFactory!=='function' || !windowRef) throw new TypeError('PLATFORM_SYNTHETIC_PRESENTATION_INVALID');
  let model=null,dialog=null,view=null,stopped=false,resumed=false;
  function ensureModel() {
    if (!model) model=createPlatformOwnerCustomerController({ api: apiFactory(),reauthenticate: ()=>windowRef.location.reload() });
    return model;
  }
  function open() {
    if (stopped || dialog) return;
    const controller=ensureModel(),content=el('div'),close=button(t('common.close'),{ className: 'secondary' });
    dialog=openDialog({ title: t('platformOwnerCustomer.title'),content,actions: [close],labelledById: 'platformOwnerCustomerDialogTitle' });
    dialog.classList.add('platform-admin-synthetic-dialog');
    const translate=()=>{
      view?.dispose();dialog.querySelector('h2').textContent=t('platformOwnerCustomer.title');close.textContent=t('common.close');
      view=createPlatformOwnerCustomerView({ controller });content.replaceChildren(view.element);
    };
    translate();close.addEventListener('click',()=>dialog?.close());
    windowRef.addEventListener('conference-language-changed',translate);
    dialog.addEventListener('close',()=>{
      windowRef.removeEventListener('conference-language-changed',translate);view?.dispose();view=null;
      controller.stop();model=null;dialog=null;
    },{ once: true });
    void controller.load();
  }
  return Object.freeze({
    renderControl() {
      const control=button(t('platformOwnerCustomer.open'),{ className: 'platform-admin-reset' });
      control.addEventListener('click',open);return control;
    },
    async resume() {
      if (resumed || stopped) return;resumed=true;const controller=ensureModel();await controller.load();
      if (!stopped && (controller.snapshot().directory?.pending || windowRef.location.search==='?auth=owner_intent')) open();
    },
    stop() { if (stopped) return;stopped=true;dialog?.close();model?.stop();model=null; },
  });
}

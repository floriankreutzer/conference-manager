import { t } from '../core/i18n.js';
import { button,el,openDialog } from '../core/ui.js';
import { shouldPresentPlatformPermission } from './contracts.js';
import { createPlatformInvitationController } from './customer-invitation-controller.js';
import { createPlatformInvitationView } from './customer-invitations-view.js';

// Explicit composition port for the protected real-customer mode. No Demo
// adapter, browser state, role claim or unsupported endpoint enables it.
export function createPlatformInvitationPresentation({ api,windowRef=globalThis.window }={}) {
  if (!api || ['create','list','issue','mutate'].some(method=>typeof api[method]!=='function')
    || !windowRef) throw new TypeError('PLATFORM_INVITATION_PRESENTATION_INVALID');
  let currentKey=null,tenantModel=null,tenantView=null,creation=null,stopped=false;
  const eligible=(operator,operationProofAvailable)=>shouldPresentPlatformPermission(operator,'platform:invitation:manage',Date.now(),operationProofAvailable);
  function clearTenant() {
    tenantView?.element.replaceChildren();tenantView?.dispose();tenantView=null;tenantModel?.controller.stop();tenantModel=null;
  }
  function closeCreation() { creation?.dialog.close(); }
  function openCreation(onCreated,isCurrent) {
    if (creation || stopped || !isCurrent()) return;
    const draft={ displayName: '',reason: '',confirmation: '',invitations: [] };
    const controller=createPlatformInvitationController({ api,onCreated: async result=>{
      if (!stopped && isCurrent()) { closeCreation();await onCreated(result); }
    } });
    const content=el('div'),close=button(t('common.close'),{ className: 'secondary' });
    const dialog=openDialog({ title: t('platformInvitations.createTitle'),content,actions: [close],labelledById: 'platformCustomerCreationTitle' });
    creation={ dialog,view: null };
    function translate() {
      if (!creation || stopped) return;
      creation.view?.dispose();dialog.querySelector('h2').textContent=t('platformInvitations.createTitle');close.textContent=t('common.close');
      creation.view=createPlatformInvitationView({ controller,draft,creation: true,isCurrent: ()=>!stopped && isCurrent() });
      content.replaceChildren(creation.view.element);
    }
    translate();content.querySelector('input')?.focus();
    windowRef.addEventListener('conference-language-changed',translate);
    close.addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{
      windowRef.removeEventListener('conference-language-changed',translate);creation?.view?.dispose();creation=null;
      controller.stop();draft.invitations.splice(0);draft.displayName='';draft.reason='';draft.confirmation='';
    },{ once: true });
  }
  return Object.freeze({
    beginRender({ key=null }={}) {
      tenantView?.dispose();tenantView=null;
      if (key!==currentKey) { clearTenant();closeCreation();currentKey=key; }
    },
    renderCreateControl({ operator,operationProofAvailable,onStepUp,onCreated,isCurrent }) {
      if (!operator.permissions.includes('platform:invitation:manage')) return null;
      const panel=el('section',{ className: 'card platform-admin-create-panel' },[
        el('h2',{ text: t('platformInvitations.createTitle') }),el('p',{ text: t('platformInvitations.ownerNote') }),
      ]);
      const permitted=eligible(operator,operationProofAvailable);
      if (!permitted && typeof onStepUp!=='function') return panel;
      const control=button(t(permitted ? 'platformAdmin.create.start' : 'platformAdmin.actions.stepUp'),{ className: 'primary',
        dataset: { platformAdminCreateTenant: 'true' } });
      control.addEventListener('click',()=>{ if (permitted) openCreation(onCreated,isCurrent);else onStepUp(); });
      panel.append(el('div',{ className: 'button-row' },[control]));return panel;
    },
    renderTenantPanel({ tenant,operator,operationProofAvailable,onStepUp,isCurrent }) {
      if (!operator.permissions.includes('platform:invitation:manage') || !['onboarding','ready','active'].includes(tenant.lifecycleState)) return null;
      if (!eligible(operator,operationProofAvailable)) {
        const panel=el('section',{ className: 'card' },[el('p',{ text: t('platformAdmin.actions.stepUpRequired') })]);
        if (typeof onStepUp==='function') { const control=button(t('platformAdmin.actions.stepUp'));control.addEventListener('click',onStepUp);panel.append(control); }
        return panel;
      }
      if (!tenantModel || tenantModel.tenantId!==tenant.id) {
        clearTenant();tenantModel={ tenantId: tenant.id,draft: { reason: '',invitations: [] },
          controller: createPlatformInvitationController({ api,tenantId: tenant.id }) };
      }
      tenantView=createPlatformInvitationView({ controller: tenantModel.controller,draft: tenantModel.draft,isCurrent });
      return tenantView.element;
    },
    clear() { stopped=true;clearTenant();closeCreation();currentKey=null; },
  });
}

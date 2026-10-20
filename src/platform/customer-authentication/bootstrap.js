import { bootstrapProductionAuthentication,PRODUCTION_AUTH_STATUS } from '../production-session.js';
import { createCustomerEmailClient } from './client.js';
import { createCustomerEmailController } from './controller.js';
import { createCustomerEmailLoginView } from './view.js';
import { createCustomerMicrosoftClient } from './microsoft-client.js';
import { createCustomerAccountController } from './account-controller.js';
import { createCustomerAccountView } from './account-view.js';

function continuation(options) {
  const search=options.location?.search ?? globalThis.location?.search ?? '';
  if (typeof search!=='string' || search.length>256) return null;
  const query=new URLSearchParams(search);
  if ([...query.keys()].length!==1 || query.getAll('auth').length!==1) return null;
  const value=query.get('auth');
  return value==='microsoft_membership_required' ? 'membership' : value==='microsoft_link_confirmation_required' ? 'link' : null;
}

// Production-only composition. The shared shell receives a presentation port,
// and neither closed Demo entrypoint imports these real authentication modules.
export async function bootstrapInvitedCustomerAuthentication(options = {}) {
  const enabled=options.microsoftAuthenticationEnabled ?? false;
  if (typeof enabled!=='boolean') throw new TypeError('CUSTOMER_MICROSOFT_PRESENTATION_CONFIGURATION_INVALID');
  const result=await bootstrapProductionAuthentication(options);
  if (!result.runtime || result.status===PRODUCTION_AUTH_STATUS.UNAVAILABLE
    || result.status===PRODUCTION_AUTH_STATUS.AUTHENTICATED && !enabled) return result;
  let view=null,pendingView=null,pending=enabled ? continuation(options) : null;
  const replaceRoot=()=>{ if (typeof options.replace==='function') options.replace('/');else globalThis.location.replace('/'); };
  const navigate=url=>{ if (typeof options.navigate==='function') options.navigate(url);else globalThis.location.assign(url); };
  async function completeSession(expected=null) {
    const fresh=await result.runtime.bootstrap();
    if (fresh.status!==PRODUCTION_AUTH_STATUS.AUTHENTICATED || expected
      && (fresh.session.user.id!==expected.user.id || fresh.session.tenant.id!==expected.tenant.id)) {
      throw new Error('CUSTOMER_AUTHENTICATION_SESSION_NOT_CONFIRMED');
    }
    pending=null;replaceRoot();
  }
  function createSignInView() {
    if (view) return view;
    const controller=createCustomerEmailController({ client: createCustomerEmailClient(options),
      microsoftClient: enabled ? createCustomerMicrosoftClient(options) : null,initialMicrosoftChoice: pending==='membership',
      completeSession });
    view=createCustomerEmailLoginView({ controller,signInWithMicrosoft: result.runtime.signIn });
    void controller.load(); return view;
  }
  function createAccountView(initialConfirmation=false,heading='h3',onClose=replaceRoot) {
    if (typeof onClose!=='function') throw new TypeError('CUSTOMER_ACCOUNT_CLOSE_HANDLER_INVALID');
    const expected=result.runtime.currentSession();
    const controller=createCustomerAccountController({ client: createCustomerMicrosoftClient(options),initialConfirmation,
      currentSession: result.runtime.currentSession,navigate,completeSession: ()=>completeSession(expected),
      reauthenticate: result.runtime.signOut,cancel() { pending=null;onClose(); } });
    const accountView=createCustomerAccountView({ controller,heading,languageControl: initialConfirmation,closeAction: initialConfirmation });
    void controller.load();return accountView;
  }
  const runtime=Object.freeze({ ...result.runtime,createSignInView,...(enabled ? {
    createAccountSecurityView: ({ onClose=replaceRoot }={})=>createAccountView(false,'h3',onClose),
    createPendingAuthenticationView() {
      if (!pending) return null;
      if (pending==='membership') return createSignInView();
      if (pendingView) return pendingView;
      pendingView=createAccountView(true,'h2');return pendingView;
    },
  } : {}) });
  return Object.freeze({ ...result,runtime });
}

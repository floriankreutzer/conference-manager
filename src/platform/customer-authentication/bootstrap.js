import { bootstrapProductionAuthentication,PRODUCTION_AUTH_STATUS } from '../production-session.js';
import { createCustomerEmailClient } from './client.js';
import { createCustomerEmailController } from './controller.js';
import { createCustomerEmailLoginView } from './view.js';

// Production-only composition. The shared shell receives a presentation port,
// and neither closed Demo entrypoint imports these real authentication modules.
export async function bootstrapInvitedCustomerAuthentication(options = {}) {
  const result=await bootstrapProductionAuthentication(options);
  if (result.status!==PRODUCTION_AUTH_STATUS.UNAUTHENTICATED || !result.runtime) return result;
  let view=null;
  const runtime=Object.freeze({ ...result.runtime,createSignInView() {
    if (view) return view;
    const controller=createCustomerEmailController({ client: createCustomerEmailClient(options),async completeSession() {
      const fresh=await result.runtime.bootstrap();
      if (fresh.status!==PRODUCTION_AUTH_STATUS.AUTHENTICATED) throw new Error('CUSTOMER_EMAIL_SESSION_NOT_CONFIRMED');
      if (typeof options.replace==='function') options.replace('/'); else globalThis.location.replace('/');
    } });
    view=createCustomerEmailLoginView({ controller,signInWithMicrosoft: result.runtime.signIn });
    void controller.load(); return view;
  } });
  return Object.freeze({ ...result,runtime });
}

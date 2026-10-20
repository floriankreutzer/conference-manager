import { bootstrapCustomerApplication } from '../app.js';
import { RUNTIME_MODE } from '../core/security-policy.js';
import { installCustomerInactivityLock } from './inactivity-lock.js';
import { bootstrapInvitedCustomerAuthentication } from './customer-authentication/bootstrap.js';

async function bootstrapProductionCustomerApplication() {
  const application = await bootstrapCustomerApplication({
    runtimeMode: RUNTIME_MODE.PRODUCTION,
    authenticationBootstrap: bootstrapInvitedCustomerAuthentication,
  });
  installCustomerInactivityLock({
    context: application.context,
    invalidateApplicationRenders: application.shell.invalidatePendingRender,
  });
}

void bootstrapProductionCustomerApplication();

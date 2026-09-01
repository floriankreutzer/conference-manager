import { bootstrapCustomerApplication } from '../app.js';
import { RUNTIME_MODE } from '../core/security-policy.js';
import { installCustomerInactivityLock } from './inactivity-lock.js';
import { bootstrapProductionAuthentication } from './production-session.js';

async function bootstrapProductionCustomerApplication() {
  const application = await bootstrapCustomerApplication({
    runtimeMode: RUNTIME_MODE.PRODUCTION,
    authenticationBootstrap: bootstrapProductionAuthentication,
  });
  installCustomerInactivityLock({
    context: application.context,
    invalidateApplicationRenders: application.shell.invalidatePendingRender,
  });
}

void bootstrapProductionCustomerApplication();

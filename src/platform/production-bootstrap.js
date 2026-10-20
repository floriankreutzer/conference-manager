import { bootstrapCustomerApplication } from '../app.js';
import { RUNTIME_MODE } from '../core/security-policy.js';
import { installCustomerInactivityLock } from './inactivity-lock.js';
import { bootstrapInvitedCustomerAuthentication } from './customer-authentication/bootstrap.js';
import { createCustomerInvitationClient } from './customer-invitations/client.js';
import { featureFlags } from './feature-flags.js';

async function bootstrapProductionCustomerApplication() {
  const application = await bootstrapCustomerApplication({
    runtimeMode: RUNTIME_MODE.PRODUCTION,
    authenticationBootstrap: options=>bootstrapInvitedCustomerAuthentication({ ...options,
      microsoftAuthenticationEnabled: featureFlags.isEnabled('customer.microsoft-authentication') }),
    invitationAdministrationFactory: featureFlags.isEnabled('customer.invitations') ? createCustomerInvitationClient : null,
  });
  installCustomerInactivityLock({
    context: application.context,
    invalidateApplicationRenders: application.shell.invalidatePendingRender,
  });
}

void bootstrapProductionCustomerApplication();

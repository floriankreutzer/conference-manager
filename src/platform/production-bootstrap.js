import { bootstrapCustomerApplication } from '../app.js';
import { RUNTIME_MODE } from '../core/security-policy.js';
import { installCustomerInactivityLock } from './inactivity-lock.js';
import { bootstrapInvitedCustomerAuthentication } from './customer-authentication/bootstrap.js';
import { createCustomerInvitationClient } from './customer-invitations/client.js';
import { featureFlags } from './feature-flags.js';

async function bootstrapProductionCustomerApplication() {
  const presentationFlags=featureFlags.forProtectedDocument(globalThis.document);
  const application = await bootstrapCustomerApplication({
    runtimeMode: RUNTIME_MODE.PRODUCTION,
    authenticationBootstrap: options=>bootstrapInvitedCustomerAuthentication({ ...options,
      microsoftAuthenticationEnabled: presentationFlags.isEnabled('customer.microsoft-authentication'),
      syntheticHandoffEnabled: presentationFlags.isEnabled('customer.synthetic-handoff') }),
    invitationAdministrationFactory: presentationFlags.isEnabled('customer.invitations') ? createCustomerInvitationClient : null,
  });
  installCustomerInactivityLock({
    context: application.context,
    invalidateApplicationRenders: application.shell.invalidatePendingRender,
  });
}

void bootstrapProductionCustomerApplication();

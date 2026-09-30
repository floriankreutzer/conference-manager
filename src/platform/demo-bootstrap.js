import { bootstrapCustomerApplication } from '../app.js';
import { RUNTIME_MODE } from '../core/security-policy.js';
import { createDemoMicrosoft365ConnectionApi } from './demo-microsoft365-connection-api.js';
import { renderDemoSecurityControl } from './demo-security.js';
import { bootstrapDemoCustomerAuthentication } from './demo-session.js';
import { installCustomerInactivityLock } from './inactivity-lock.js';

async function bootstrapDemoCustomerApplication() {
  const application = await bootstrapCustomerApplication({
    runtimeMode: RUNTIME_MODE.DEMO,
    authenticationBootstrap: bootstrapDemoCustomerAuthentication,
    microsoft365ConnectionFactory: createDemoMicrosoft365ConnectionApi,
  });
  const renderSecurityControl = () => {
    document.querySelector('[data-demo-security]')?.remove();
    if (document.documentElement.dataset.sessionLocked === 'true') return;
    renderDemoSecurityControl({
      context: application.context,
      onAuthorityFailure: application.shell.invalidateAuthorityProjection,
    });
  };
  renderSecurityControl();
  installCustomerInactivityLock({
    context: application.context,
    invalidateApplicationRenders: application.shell.invalidatePendingRender,
  });
  window.addEventListener('conference-language-changed', renderSecurityControl);
}

void bootstrapDemoCustomerApplication();

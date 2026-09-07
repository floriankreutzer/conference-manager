import { bootstrapCustomerApplication } from '../app.js';
import { RUNTIME_MODE } from '../core/security-policy.js';
import { renderDemoSecurityControl } from './demo-security.js';
import { bootstrapDemoCustomerAuthentication } from './demo-session.js';
import { installCustomerInactivityLock } from './inactivity-lock.js';

async function bootstrapDemoCustomerApplication() {
  const application = await bootstrapCustomerApplication({
    runtimeMode: RUNTIME_MODE.DEMO,
    authenticationBootstrap: bootstrapDemoCustomerAuthentication,
  });
  const renderSecurityControl = () => {
    document.querySelector('[data-demo-security]')?.remove();
    if (document.documentElement.dataset.sessionLocked === 'true') return;
    renderDemoSecurityControl({ context: application.context });
  };
  renderSecurityControl();
  installCustomerInactivityLock({
    context: application.context,
    invalidateApplicationRenders: application.shell.invalidatePendingRender,
  });
  window.addEventListener('conference-language-changed', renderSecurityControl);
}

void bootstrapDemoCustomerApplication();

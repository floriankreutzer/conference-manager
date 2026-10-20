import { createApiClient } from '../../core/api-client.js';
import { createPlatformAdminApplication } from '../index.js';
import {
  createPlatformOperatorSessionApi,
  PLATFORM_ADMIN_SIGN_IN_PATH,
  PLATFORM_ADMIN_STEP_UP_PATH,
} from './operator-session.js';
import { createPlatformPasskeyLogin } from './passkey-login.js';
import { createPlatformPasskeyLoginView } from './passkey-login-view.js';
import { createPlatformPasskeyManagement } from './passkey-management.js';
import { createPlatformPasskeyOperationsClient, loadPlatformPasskeyConfiguration } from './passkey-operations-client.js';
import { announce } from '../../core/ui.js';
import { t } from '../../core/i18n.js';
import { createPlatformAdminApi } from '../platform-api.js';

async function bootstrapProductionPlatformAdmin() {
  let csrfToken = null;
  try {
    const apiClient = createApiClient({
      baseUrl: '/api/v1/platform/',
      csrfTokenProvider: () => csrfToken,
    });
    const sessionApi = createPlatformOperatorSessionApi({ apiClient });
    const session = await sessionApi.loadSession();
    if (!session) {
      let loginView;
      const login = createPlatformPasskeyLogin({ onChange: state => loginView?.update(state) });
      loginView = createPlatformPasskeyLoginView({ controller: login });
      const application = createPlatformAdminApplication({
        runtime: 'production',
        sessionState: 'unauthenticated',
        signInPath: PLATFORM_ADMIN_SIGN_IN_PATH,
        renderSessionGate: () => loginView.render(),
      });
      await application.start();
      globalThis.addEventListener('pagehide', () => login.stop(), { once: true });
      await login.load();
      return;
    }
    csrfToken = session.csrfToken;
    const configuration = await loadPlatformPasskeyConfiguration(apiClient);
    if (configuration?.mode === 'passkey_setup') throw new TypeError('PLATFORM_SETUP_SESSION_REJECTED');
    async function refreshSession() {
      const refreshed = await sessionApi.loadSession();
      if (!refreshed) return false;
      csrfToken = refreshed.csrfToken; return true;
    }
    const protectedClient = configuration?.mode === 'application_passkey' ? createPlatformPasskeyOperationsClient({
      csrfTokenProvider: () => csrfToken, onPrompt: () => announce(t('platformAdmin.passkey.busy')), refreshSession,
    }) : null;
    const keyManagement = protectedClient ? createPlatformPasskeyManagement({ apiClient, refreshSession }) : null;
    if (keyManagement) globalThis.addEventListener('pagehide', () => keyManagement.stop(), { once: true });
    if (protectedClient) globalThis.addEventListener('pagehide', () => protectedClient.stop(), { once: true });
    const application = createPlatformAdminApplication({
      runtime: 'production',
      sessionState: 'authenticated',
      operator: session.operator,
      dataSource: createPlatformAdminApi({ apiClient: protectedClient ?? apiClient }),
      operationProofAvailable: protectedClient !== null,
      renderSecurityControls: keyManagement ? () => keyManagement.renderControl() : null,
      onSignOut: () => sessionApi.signOut(),
      onStepUp: protectedClient ? null : () => globalThis.location.assign(PLATFORM_ADMIN_STEP_UP_PATH),
    });
    await application.start();
  } catch {
    const application = createPlatformAdminApplication({
      runtime: 'production',
      sessionState: 'unavailable',
    });
    await application.start();
  }
}

await bootstrapProductionPlatformAdmin();

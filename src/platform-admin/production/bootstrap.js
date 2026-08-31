import { createApiClient } from '../../core/api-client.js';
import { createPlatformAdminApplication } from '../index.js';
import {
  createPlatformOperatorSessionApi,
  PLATFORM_ADMIN_SIGN_IN_PATH,
  PLATFORM_ADMIN_STEP_UP_PATH,
} from './operator-session.js';
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
      const application = createPlatformAdminApplication({
        runtime: 'production',
        sessionState: 'unauthenticated',
        signInPath: PLATFORM_ADMIN_SIGN_IN_PATH,
      });
      await application.start();
      return;
    }
    csrfToken = session.csrfToken;
    const application = createPlatformAdminApplication({
      runtime: 'production',
      sessionState: 'authenticated',
      operator: session.operator,
      dataSource: createPlatformAdminApi({ apiClient }),
      onSignOut: () => sessionApi.signOut(),
      onStepUp: () => globalThis.location.assign(PLATFORM_ADMIN_STEP_UP_PATH),
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

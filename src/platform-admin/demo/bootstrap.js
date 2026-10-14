import { createApiClient } from '../../core/api-client.js';
import { createPlatformAdminApplication } from '../index.js';
import { createPlatformAdminApi } from '../platform-api.js';
import { createProviderUsageApi } from './provider-usage-api.js';
import { createProductDeliveryApi } from './product-delivery-api.js';
import { featureFlags } from '../../platform/feature-flags.js';
import {
  PLATFORM_ADMIN_DEMO_PERSONAS,
  createPlatformDemoSessionApi,
  loadBoundedPlatformDemoSession,
} from './operator-session.js';

async function bootstrapDemoPlatformAdmin() {
  let csrfToken = null;
  try {
    const apiClient = createApiClient({
      baseUrl: '/api/v1/platform/',
      csrfTokenProvider: () => csrfToken,
    });
    const sessionApi = createPlatformDemoSessionApi({ apiClient });
    let session = await loadBoundedPlatformDemoSession(sessionApi);
    csrfToken = session.csrfToken;

    const application = createPlatformAdminApplication({
      runtime: 'demo',
      sessionState: 'authenticated',
      operator: session.operator,
      dataSource: createPlatformAdminApi({ apiClient }),
      providerUsage: featureFlags.isEnabled('platform.provider-usage') ? createProviderUsageApi({ apiClient }) : null,
      productDelivery: featureFlags.isEnabled('platform.product-delivery') ? createProductDeliveryApi({ apiClient }) : null,
      demoControls: Object.freeze({
        roleIds: PLATFORM_ADMIN_DEMO_PERSONAS,
        currentRoleId: () => session.persona,
        async setRole(persona) {
          const next = await sessionApi.selectPersona(persona);
          session = next;
          csrfToken = next.csrfToken;
          return next.operator;
        },
        async reset() {
          await sessionApi.reset();
          csrfToken = null;
          const next = await loadBoundedPlatformDemoSession(sessionApi);
          session = next;
          csrfToken = next.csrfToken;
          return next.operator;
        },
      }),
    });
    await application.start();
  } catch {
    const application = createPlatformAdminApplication({
      runtime: 'demo',
      sessionState: 'unavailable',
    });
    await application.start();
  }
}

await bootstrapDemoPlatformAdmin();

import { createPlatformAdminApplication } from '../index.js';
import { createPlatformAdminDemoAdapter } from './demo-adapter.js';
import { createPlatformAdminDemoStore } from './demo-store.js';
import { PLATFORM_ADMIN_DEMO_ROLE_IDS } from './operator-fixtures.js';

const store = createPlatformAdminDemoStore();
const adapter = createPlatformAdminDemoAdapter({ store });

const application = createPlatformAdminApplication({
  runtime: 'demo',
  sessionState: 'authenticated',
  operator: adapter.operator(),
  dataSource: adapter,
  demoControls: Object.freeze({
    roleIds: PLATFORM_ADMIN_DEMO_ROLE_IDS,
    currentRoleId: () => store.read().roleId,
    setRole: (roleId) => adapter.setRole(roleId),
    reset: () => adapter.reset(),
  }),
});

await application.start();

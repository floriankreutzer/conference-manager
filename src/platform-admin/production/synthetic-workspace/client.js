import { createPlatformCustomerWorkspaceClient } from '../customer-workspace-client.js';

// Fixed synthetic generation/delegation contract retained for existing callers.
export function createPlatformSyntheticWorkspaceClient(options={}) {
  return createPlatformCustomerWorkspaceClient({ ...options,kind: 'synthetic' });
}

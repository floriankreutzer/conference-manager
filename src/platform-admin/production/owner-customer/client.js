import { createPlatformCustomerWorkspaceClient } from '../customer-workspace-client.js';

// The caller supplies the actual shared Microsoft queue/confirmation instance.
export function createPlatformOwnerCustomerClient(options={}) {
  return createPlatformCustomerWorkspaceClient({ ...options,kind: 'owner_real',assuranceMode: 'microsoft_mfa' });
}

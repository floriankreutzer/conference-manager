// Compatibility facade for the established Tenant Admin public import. Demo
// lifecycle and elevated-role state now share one deterministic operations port.
export {
  createDemoTenantUserOperations as createDemoTenantUserAdministration,
} from './demo-user-operations.js';

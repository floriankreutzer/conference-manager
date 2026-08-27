// Compatibility facade for the established Platform import path. The canonical
// adapter now owns both elevated-role and Tenant User lifecycle operations.
export {
  TenantUserOperationsApiError as TenantUserAdministrationApiError,
  createTenantUserOperationsApi as createTenantUserAdministrationApi,
} from './tenant-user-operations-api.js';

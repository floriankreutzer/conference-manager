import { bootstrapCustomerApplication } from '../app.js';
import { RUNTIME_MODE } from '../core/security-policy.js';
import { bootstrapProductionAuthentication } from './production-session.js';

void bootstrapCustomerApplication({
  runtimeMode: RUNTIME_MODE.PRODUCTION,
  authenticationBootstrap: bootstrapProductionAuthentication,
});

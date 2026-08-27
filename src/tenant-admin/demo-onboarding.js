// Compatibility facade for the existing Tenant Admin onboarding factory. The
// deterministic Demo runtime now also exposes the operational recovery view.
export {
  createDemoMicrosoft365Operations as createDemoOnboarding,
} from './demo-microsoft365-operations.js';

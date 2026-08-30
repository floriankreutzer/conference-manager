# Platform Control Plane Demo runbook

The Platform Admin Demo is a synthetic, local-only acceptance surface for issue #132. It is not a Production fallback, security control, customer application mode, or source of Platform authority.

## Start and identify the Demo

1. Install dependencies with `npm ci`.
2. Start the repository preview server used by the Playwright configuration.
3. Open `/platform-admin-demo/` directly.
4. Verify the persistent banner says **Isolated Demo · synthetic data** (or its German equivalent).
5. Verify the document declares `conference-runtime=demo` and `platform-demo-data=synthetic-local-only`.

Do not demonstrate this surface on the customer or Production Platform Admin URL. The Demo CSP forbids every network connection with `connect-src 'none'`.

## Deterministic acceptance scenarios

The initial fixture contains exactly one Tenant in each lifecycle state: pending, onboarding, ready, active, suspended, and archived. It also includes bounded synthetic readiness, entitlement, integration-health, diagnostics, audit, metering, and runtime states.

Use the simulated role selector to verify presentation behavior:

| Selector | Exact simulated role | Expected use |
| --- | --- | --- |
| Support Reader | `platform_support_reader` | Bounded operational reads only |
| Tenant Operator | `platform_tenant_operator` | Invitation, lifecycle, entitlement, and quota presentation with simulated step-up |
| Security Auditor | `platform_security_auditor` | Sensitive diagnostics and Platform-audit review with simulated step-up |
| Security Admin | `platform_security_admin` | Recovery and security-administration presentation with simulated step-up |

The selector simulates a server-issued authorization snapshot for the Demo only. The banner and selector keep this simulation visible. It never changes a Production session or calls an identity provider.

Suggested acceptance path:

1. As Support Reader, open the active Tenant and confirm lifecycle mutations are hidden.
2. Switch to Tenant Operator, suspend the active Tenant, enter a five-to-240-character reason, and confirm the exact target.
3. Reload and verify the synthetic mutation remains in the isolated Demo namespace.
4. Open the suspended Tenant recovery section. Confirm Tenant Operator cannot execute recovery.
5. Switch to Security Admin and confirm the recovery action and simulated `step_up` assurance are visible.
6. Review readiness, entitlements, integration health, minimized diagnostics, Platform audit, metering, and runtime sections across the fixture states.
7. Apply name, lifecycle, and health filters and verify deterministic results.
8. Add an unrelated browser-storage key, choose **Reset Demo data**, and verify the six initial states return while the unrelated key remains.

## Isolation evidence

Collect the following evidence without including session values, invitation tokens, or unrelated browser data:

- screenshot of the visible synthetic/local-only disclosure;
- screenshot or recording of the six lifecycle states and role selector;
- browser network trace showing no `/api/*` or external request from `/platform-admin-demo/`;
- evidence that reset restores the initial fixture and preserves an unrelated storage key;
- `npm run test:e2e -- tests/e2e/platform-admin.spec.js` result for Chromium and WebKit.

The Demo persists only the bounded document under `platform_admin_demo_v1`. Reset removes and recreates only that key. Malformed or incompatible Demo data is rejected and reset to the deterministic fixture. Production code is prohibited from reading this namespace.

External acceptance evidence must be attached to the issue by the accepting product, operations, security, or customer role identified in the issue. Repository tests and this runbook prepare the acceptance; they do not self-approve external evidence.

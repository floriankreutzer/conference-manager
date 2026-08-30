# Platform Control Plane Demo runbook

The Platform Admin Demo is a synthetic, server-backed operational surface. It uses the Platform Demo API process and the isolated PostgreSQL database shared with the Customer Demo. It is not a Production fallback, customer application mode, or real-provider acceptance environment.

## Start and identify the Demo

1. Install dependencies with `npm ci`.
2. Start the Demo PostgreSQL database, apply the `conference-manager-api` migrations and deterministic Demo migration, and run the documented reset/reseed command.
3. Start the separate Customer Demo and Platform Demo API processes with distinct session, CSRF, audit and least-privilege database credentials.
4. Serve the Platform Admin Demo on its configured Platform Demo origin and open `/platform-admin-demo/` directly.
5. Verify the persistent Demo disclosure.
6. Verify the document declares `conference-runtime=demo` and `platform-demo-data=synthetic-server-backed`.

Do not demonstrate this surface on the Customer or Production Platform Admin origin. Its CSP permits same-origin API calls only. The Platform browser calls `/api/v1/platform/*`; it never connects to PostgreSQL directly or calls the Customer API/session boundary.

## Deterministic acceptance scenarios

The deterministic seed contains at least two isolated Tenants and the bounded lifecycle, readiness, entitlement, integration-health, diagnostics, audit, metering and runtime states required by the Demo scenarios. The Platform and Customer Demos observe the same canonical Tenant IDs.

Use the simulated role selector to verify presentation behavior:

| Selector | Persona request | Expected server-resolved use |
| --- | --- | --- |
| Support Reader | `support_reader` | Bounded operational reads only |
| Tenant Operator | `tenant_operator` | Invitation, lifecycle, entitlement and quota operations within server-resolved scope |
| Security Auditor | `security_auditor` | Bounded diagnostics and Platform-audit review |
| Security Admin | `security_admin` | Recovery and security-administration operations with server-resolved assurance |

The selector sends an allowlisted persona request to the Demo Platform session service. The server resolves the fixture operator's roles, permissions, assurance and target scope and returns a minimized session projection. Browser values do not mint authority. Persona changes rotate the server-owned Demo session context and never change a Production or Customer session.

Suggested acceptance path:

1. As Support Reader, open the active Tenant and confirm lifecycle mutations are hidden.
2. Switch to Tenant Operator, suspend the active Tenant, enter a five-to-240-character reason, and confirm the exact target.
3. Reload or open a fresh browser session and verify that the mutation remains in the shared Demo database.
4. Open the suspended Tenant recovery section. Confirm Tenant Operator cannot execute recovery.
5. Switch to Security Admin and confirm the recovery action and simulated `step_up` assurance are visible.
6. Review readiness, entitlements, integration health, minimized diagnostics, Platform audit, metering, and runtime sections across the fixture states.
7. Apply name, lifecycle, and health filters and verify deterministic results.
8. Choose **Reset Demo data**, confirm the operation, and record the returned seed version/checksum.
9. Verify that the complete deterministic Platform baseline returns and that the Customer Demo observes the same reset Tenant/business state after obtaining a fresh Customer session.

## Isolation evidence

Collect the following evidence without including session values, invitation tokens, or unrelated browser data:

- screenshot of the visible synthetic/server-backed disclosure;
- screenshot or recording of the deterministic lifecycle states and persona selector;
- browser network trace showing only expected same-origin `/api/v1/platform/*` calls and no Customer API or external provider request;
- evidence that reset restores the complete seed version/checksum and invalidates prior Demo sessions;
- cross-browser evidence that Customer and Platform surfaces observe the same canonical Tenant mutation while remaining separately authenticated;
- `npm run test:e2e -- tests/e2e/platform-admin.spec.js` result for Chromium and WebKit.

PostgreSQL is the sole Platform Demo business authority. The retired `platform_admin_demo_v1` document, browser fixture store and browser mutation rules are not part of the active runtime. API, session or schema failure renders the Platform Demo unavailable; it never falls back to browser storage or local fixtures.

Reset is registered only in Demo composition. The HTTP control requires the Platform Demo session, CSRF validation, step-up assurance and the recovery permission; the command-line path requires the dedicated reset database role and exact expected seed version. An exclusive database lock serializes reset, and the transaction restores canonical rows/projections, records audit evidence and invalidates Customer and Platform Demo sessions. Production artifacts and route registries must not contain Demo reset code.

If a consuming issue explicitly requires external acceptance, its accepting product, operations, security or customer role must attach the evidence. Repository tests and this runbook do not self-approve external evidence.

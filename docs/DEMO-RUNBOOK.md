# Conference Manager Demo Runbook

## Purpose and status

This runbook describes the deterministic, server-backed Customer Demo introduced by SaaS 3.5. It is an operating aid, not Production or real-provider acceptance evidence. Use example data only.

The browser declares `conference-runtime=demo` and `conference-demo-data=synthetic-server-backed`. It calls the Customer Demo API on the same Customer Demo origin. A separate Customer Demo process issues the Customer session and accesses the isolated shared Demo PostgreSQL database with a least-privilege customer role.

The Tenant and persona selectors are request controls, not authorization controls. The browser sends an allowlisted context choice; the server resolves the fixture User, Tenant, roles and permissions and returns a minimized effective session. Customer Demo cookies, CSRF state and Principals are separate from the Platform Demo boundary.

## Deterministic baseline

After the documented backend reset/reseed operation, the complete shared Demo baseline is recreated:

The effective presentation is Conference Manager, German, EUR and the code-shipped PAVUREL product-default signet.

| Surface | Baseline | Lifetime |
| --- | --- | --- |
| Language | A valid selected language may remain as a non-authoritative preference. German is the fallback when no valid preference exists. | Browser-local preference |
| Customer context | A seeded Tenant and Employee persona are returned by the Customer Demo session service. | Server session |
| Customer Tenants | At least two stable, isolated Tenants with distinct Users, roles, lifecycle/readiness and business state. | Shared Demo PostgreSQL |
| Profile and Employee data | Deterministic fixture profile, catalogue, Sites/Rooms, Requests, history and notifications. | Shared Demo PostgreSQL |
| Tenant settings and presentation | Deterministic Organization, Locations, Catalogue, Booking Policies and Cost Allocation revisions, including the code-shipped PAVUREL product-default signet. | Shared Demo PostgreSQL |
| Integration simulation | Deterministic provider-neutral success and failure scenarios; no real Microsoft Graph or identity-provider calls. | Demo provider adapter and PostgreSQL |
| Tenant users, audit and readiness | Deterministic fixture identities and server-owned Tenant/audit/readiness projections. | Shared Demo PostgreSQL |
| Images and route code | Catering art is deterministic inline SVG. The baseline OpenStreetMap QR code is a repository-owned asset. Conference Manager image edits accept only bounded managed `assets/` paths or constrained inline SVG data; cross-origin sources are rejected before save. No external image or QR service is contacted automatically. | Repository-owned |

The Demo reuses canonical Customer application services and repository contracts. A shared database does not combine the Customer and Platform trust domains or authorize either process to use the other's session, cookie, CSRF state, routes or database role.

## Reset and reseed

1. Use the documented `conference-manager-api` Demo reset command, or the authenticated Platform Demo reset control.
2. Supply the exact expected seed version when using the command-line reset.
3. Wait for the reset to complete and record the returned seed version and checksum.
4. Reload the Customer Demo. The prior Demo sessions have been invalidated, so a fresh Customer session is established.
5. Verify the seeded Tenant and Employee persona, then inspect the deterministic catalogue, Site/Room and Request baseline.
6. Select Tenant Admin through the Demo context control and verify the seeded settings, Users, integration simulation, audit and readiness state.
7. Open the Platform Demo separately and verify that it observes the same canonical Tenant identifiers and reset baseline through its own session.

Reset is a backend operation protected by Demo-only composition, authorization, CSRF when exposed through HTTP, and a database-level exclusive reset lease. It atomically clears mutable Demo state, reseeds canonical rows and projections, records the reset audit event, advances session invalidation state and returns the deterministic seed version/checksum. Production artifacts and route registries do not contain the reset implementation.

## Current usable baseline scenarios

- Employee: create and submit an example conference request from the selected Tenant's persisted catalogue and Site/Room configuration.
- Conference Manager: inspect the same persisted Request, execute supported server-authorized workflow decisions, and review planning and reporting projections.
- Tenant Admin: inspect and edit the selected Tenant's server-backed Organization, Locations, Catalogue, Booking Policies and Cost Allocation; exercise the deterministic integration simulation; inspect Users, audit and readiness.
- Tenant Admin bulk transfer: download a template or minimized export, validate the selected document, apply the receipt-backed change, and verify that replay is idempotent. Reset restores the canonical seed revision and clears mutable receipts.
- Confirmed request print view: open the visitor information view. The baseline route link is external but is contacted only after deliberate navigation; its QR image is served by the Demo origin.

Changing Tenant or persona calls `PUT /api/v1/demo/session/context`, rotates the effective server-owned context and reloads the presentation. A reload, fresh browser profile or second browser observes the same persisted business state after establishing its own session.

The context change selects a deterministic server-owned fixture Principal; it does not recreate browser fixtures. The seeded Tenant presentation remains the PAVUREL product-default presentation unless an authorized Tenant setting changes it.

## Representative shared-Demo story

1. Reset/reseed and record the seed version/checksum.
2. In the Platform Demo, prepare or activate a seeded Tenant through the Platform API.
3. In the Customer Demo, select that exact Tenant and the Tenant Admin persona; update its supported settings and integration simulation.
4. Switch to Employee, create and submit a Request using the persisted Tenant configuration.
5. Switch to Conference Manager, review the same Request and complete the supported decision.
6. Switch back to Employee and verify the persisted result and history.
7. Return to the Platform Demo and verify the privacy-minimized projection for the same Tenant ID.
8. Repeat a bounded negative attempt against the second seeded Tenant to demonstrate that shared persistence does not weaken Tenant isolation.

Deterministic provider scenarios do not claim real identity, Microsoft 365 or Production evidence.

## Network and data-safety verification

The Customer Demo CSP limits connections to `'self'`; expected requests are same-origin `/api/*` calls. No cross-origin API, real identity-provider, Microsoft Graph, external image or QR service is contacted automatically. API/session/schema failure must render an unavailable or error state and must never activate browser persistence or fixtures as fallback.

Run the focused checks with:

```bash
npm run check:architecture
npm run check:persistence
node --test tests/customer-demo-session.test.js tests/customer-demo-boundaries.test.js
npx playwright test tests/e2e/demo-role-switch.spec.js
npm run check:static
```

Use the repository-wide `npm run check`, `npm run audit` and full Chromium/WebKit Playwright suite before integration.

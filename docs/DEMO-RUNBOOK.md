# Conference Manager Demo Runbook

## Purpose and status

This runbook describes the current deterministic, server-backed Demo baseline after SaaS 3.6. It is an operating aid and hosted-Demo acceptance source; it is not Production/provider/penetration evidence. Use synthetic example data only.

The canonical human entry point is the GitHub Pages launchpad published from `demo-portal/`. GitHub Pages is static navigation only. The actual applications remain separately hosted on Render:

- Customer Demo: `https://conference-manager-demo.onrender.com`
- Platform Demo: `https://conference-manager-ops-demo.onrender.com`

See `docs/DEMO-URLS.md` for the complete URL and trust-boundary contract.

The effective presentation is Conference Manager, German, EUR and the code-shipped PAVUREL product-default signet unless an authoritative Tenant presentation setting supplies an allowed customization. No external Brand asset or browser-local presentation value establishes Tenant or authorization authority.

## Security domains

Customer and Platform Demo remain separate security domains even though their synthetic business state is persisted in one isolated shared Demo PostgreSQL model.

The Customer browser calls only its same-origin Customer Demo API. The Platform browser calls only its same-origin Platform Demo API. Each process has its own session/cookie/CSRF contract and least-privilege database role. A shared database does not authorize either process to consume the other's session, routes or database authority.

The browser declares Demo runtime metadata and never establishes Tenant, User, role, permission, provider identity or reset authority. Tenant/persona selectors submit only allowlisted context intent. The server resolves the fixture Principal and returns the minimized effective session.

If the Demo API/session/schema is unavailable, the browser renders unavailable/error state. There is no LocalStorage, fixture or in-browser authorization fallback.

## Customer role baseline

Every active Customer User has the Employee baseline. Elevated roles are independent and additive:

- Employee: own Request read/cancel; no physical Request deletion.
- Conference Manager: Tenant-wide operational Request workflow, including self-approval where the workflow permits it; Room business data; Tenant Catalogue; authoritative Room prices.
- Tenant Admin: Organization, Booking Policy, Cost Allocation, Tenant Users/elevated roles, technical Locations/Sites, provider integrations/mappings and Tenant audit administration.
- Dual role: exact union of Employee + Conference Manager + Tenant Admin.

The Demo personas are `employee`, `conference_manager`, `tenant_admin` and derived `dual_role`. `dual_role` is not a fourth persisted customer authorization role; the Demo server derives the canonical union.

Provider Room identity/resource mapping remains Tenant Admin-owned. Room business fields and Catalogue/Room-price administration remain Conference Manager-owned. Tenant Admin does not inherit Conference Manager business administration and Conference Manager does not inherit provider/integration administration.

See `docs/ROLE-MODEL.md` for the canonical matrix.

## Deterministic baseline

After the documented backend reset/reseed operation, the shared Demo baseline recreates stable synthetic Tenants, Users, roles, configuration, Requests and provider simulation.

A context change selects a deterministic server-owned fixture Principal and reloads the corresponding PAVUREL product-default presentation from server-owned Tenant data. The browser selector submits only context intent and cannot synthesize Brand, role or permission authority.

| Surface | Baseline | Lifetime |
| --- | --- | --- |
| Language | Valid `de`/`en` preference; German fallback | Non-authoritative browser preference |
| Customer context | Server-issued seeded Tenant + persona session | Server session |
| Customer Tenants | At least two stable isolated Tenants with distinct Users and business state | Shared Demo PostgreSQL |
| Profile / Requests | Deterministic profiles, Requests, history and notifications | Shared Demo PostgreSQL |
| Locations | Sites, Room technical assignment and Room business fields in one persisted aggregate with field-level authorization | Shared Demo PostgreSQL |
| Catalogue | Services, equipment, catering and authoritative Room prices | Shared Demo PostgreSQL |
| Tenant settings | Organization, Booking Policies, Cost Allocation and presentation | Shared Demo PostgreSQL |
| Integration simulation | Deterministic provider-neutral success/failure; no real Microsoft Graph or IdP calls | Demo provider adapter + PostgreSQL |
| Tenant Users / audit | Deterministic fixture identities and server-owned audit/readiness projections | Shared Demo PostgreSQL |
| Platform projection | Privacy-minimized view of the same canonical Tenant identifiers/state | Separate Platform Demo process |

## Reset and reseed

1. Use the documented `conference-manager-api` Demo reset command or the authenticated Platform Demo reset control.
2. Supply the exact expected seed version for command-line reset.
3. Record the returned seed version and checksum.
4. Reload the Customer Demo. Reset invalidates prior Demo sessions, so a fresh Customer session must be established.
5. Verify the seeded Employee persona and Tenant.
6. Verify Conference Manager Room-business/Catalogue access without technical provider administration.
7. Verify Tenant Admin technical/organization/user/integration access without Conference Manager business administration.
8. Verify `dual_role` exposes the exact union.
9. Verify the Platform Demo observes the same canonical Tenant identifiers through its own separate session.

Reset is a backend-only Demo operation protected by Demo composition, authorization, CSRF for HTTP access and transaction-scoped reset locking. It atomically restores canonical synthetic state, invalidates sessions and returns deterministic evidence. Production artifacts do not contain the reset route/runtime.

## Representative end-to-end story

1. Reset/reseed and record seed version/checksum.
2. Platform Demo: inspect or activate the seeded Tenant through Platform authority.
3. Customer Demo / Tenant Admin: update an Organization or other technical Tenant setting.
4. Customer Demo / Conference Manager: maintain Room business data or Catalogue/Room price as appropriate.
5. Customer Demo / Employee: create and submit a Request from persisted Tenant configuration.
6. Customer Demo / Conference Manager: review the same Request and complete a supported workflow decision.
7. Customer Demo / Employee: verify persisted result/history.
8. Customer Demo / dual role: verify the exact independent capability union without additional permissions.
9. Platform Demo: verify the privacy-minimized projection for the same Tenant.
10. Execute a bounded cross-Tenant negative attempt and verify concealment/denial.

Provider simulation does not claim real Microsoft 365, Entra or Production evidence.

## Persona/context changes

Customer context changes call `PUT /api/v1/demo/session/context`. The server rotates the effective session context and the application reloads from the new server-owned Principal.

The frontend validates Demo sessions with the same canonical role/permission contract used for Production session projections. A persona/role/permission mismatch fails closed.

Browser storage clearing does not remove or grant authority. A second browser observes the same persisted business state only after establishing its own independent Demo session.

## Inactivity lock

Customer Demo uses the same additive inactivity-lock implementation as Production with a deterministic-friendly shorter Demo timeout of five minutes. Production uses fifteen minutes.

When locked:

- primary navigation and rendered sensitive content are removed;
- the Demo context selector is removed;
- cross-tab propagation can only propagate a lock event;
- unlock never trusts browser state and always calls the authoritative session `bootstrap()` first.

An expired, revoked or security-version-stale server session therefore cannot regain authority through the lock UI. The browser lock does not replace server session expiry/revocation/rotation, CSRF or authorization checks.

## Network and data safety

Expected Customer Demo application calls are same-origin `/api/*` requests. No real identity provider, Microsoft Graph, external image service or QR service is contacted automatically by the deterministic Demo baseline.

GitHub Pages does not call either Demo API. It contains no JavaScript, application credentials, sessions, Tenant selectors or reset endpoints and links directly to the two Render application origins.

## Required local/CI checks

```bash
npm run check
npm run audit
npm run test:e2e
npm run test:e2e:shared-demo
```

Focused role/security checks include the Production session/context tests, tenant-location ownership tests, Customer Demo session tests, inactivity policy tests and shared Demo browser journey.

## Continuous integration

Frontend CI owns two distinct browser suites:

- `e2e`: repository-owned browser regression tests under `tests/e2e`;
- `shared-demo-e2e`: the PostgreSQL-backed cross-surface journey under `tests/e2e-shared`.

The shared job checks out the API at an immutable reviewed commit, provisions isolated Demo database roles, applies canonical and Demo migrations, starts separate Customer/Platform Demo API processes and runs the shared journey. The API checkout credential is a read-only Actions secret and is not included in browser evidence.

The reciprocal API CI checks out the frontend at the immutable `DEMO_FRONTEND_REF` declared in the reviewed Render Blueprint. Cross-repository refs must represent a mutually compatible role/session contract. SaaS 3.6 intentionally updates both refs together rather than weakening the new authorization matrix to remain compatible with a pre-3.6 client/server.

## Hosted Render acceptance

`.github/workflows/hosted-demo-acceptance.yml` is the external acceptance gate for the public Render services. It does not start a local API and does not receive database credentials.

Before destructive browser actions it verifies:

- Customer and Platform readiness;
- closed deployment-identity documents on both origins;
- exact reviewed frontend/API refs;
- bounded cold-start/preflight time so cleanup reserve remains available.

The journey then proves, within the deployed environment:

- separate Customer and Platform sessions/cookies/CSRF state;
- browser storage is not authority;
- shared canonical Tenant state crosses surfaces without crossing trust domains;
- Employee, Conference Manager, Tenant Admin and dual-role behavior match the canonical role model;
- Conference Manager business ownership and Tenant Admin technical/provider ownership remain separated;
- cross-Tenant object access stays concealed/denied;
- missing CSRF and insufficient authority fail closed;
- provider degradation is bounded/server-defined;
- reset/reseed invalidates both session domains and restores the deterministic baseline.

Cleanup has priority after any destructive attempt. The workflow performs bounded repeatable reset/reseed validation and uploads non-secret evidence. A failed journey, failed cleanup, stale deployment identity or identity drift is failed acceptance.

Hosted acceptance must not be relabeled as Production/provider/penetration evidence. A Render cold-start run provides cold-start evidence only when the services were actually sleeping at the start of the run.

## GitHub Pages acceptance

The Pages workflow publishes only `demo-portal/` after a `main` change to that directory/workflow. The final milestone evidence records the actual deployment-generated Pages URL after a successful deployment. Before that run succeeds, repository documentation must not invent a Pages hostname.

Pages acceptance verifies only the launchpad contract. Customer/Platform runtime security remains evidenced by the Render/shared-Demo gates.

The launchpad's HTML meta CSP restricts resources, forms, objects and base-URL changes. GitHub Pages
does not provide repository-controlled response headers, and CSP `frame-ancestors` is ignored when
delivered in a meta element. Acceptance must therefore record the deployed provider headers
separately and must not represent the meta policy as clickjacking protection.

## Security regression register

Demo-found defects are not assumed to be Demo-only. `docs/SAAS-3.6-SECURITY-REGRESSION.md` records each discovered finding as `demo-only`, `shared-business-domain`, `production-defect` or `security-relevant`, including Production reachability, correction and regression evidence.

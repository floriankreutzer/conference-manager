# SaaS 3 Platform Control Plane topology decision

## Status

Accepted for **SaaS 3 — Platform Control Plane & Operations**.

- Tracking issue: [#92](https://github.com/floriankreutzer/conference-manager/issues/92)
- Parent roadmap: [#75](https://github.com/floriankreutzer/conference-manager/issues/75)
- Roadmap baseline: 2026-08-26
- Decision date: 2026-08-28
- Decision authority: accepted under the repository owner's delegated architecture and delivery authority for the SaaS 3 milestone

This decision extends, and does not replace, `docs/SAAS-PRODUCTION-TOPOLOGY.md`. The customer application remains logically same-origin. The Platform Control Plane receives a second, independently deployed same-origin browser/API boundary. Root `AGENTS.md`, `docs/CODING-STANDARDS.md`, `docs/ARCHITECTURE.md`, and mandatory security requirements remain authoritative.

## Context

SaaS 0 and SaaS 1 established a trusted `conference-manager-api` backend, hard Tenant isolation, customer identity and sessions, Tenant RBAC, Tenant audit integrity, entitlements, server-derived readiness, and narrowly bounded process-local operator commands. The operator commands already delegate to the onboarding, readiness, lifecycle, entitlement, and recovery application services; they are deliberately absent from the customer HTTP composition.

SaaS 3 must turn those operations into a scalable browser control plane without:

- adding Platform authority to Employee, Conference Manager, or Tenant Admin roles;
- placing privileged controls in the customer application shell;
- copying existing business rules;
- making a terminal, direct database access, or an unrestricted support console the normal operating path;
- weakening the customer origin, session, CSRF, CORS, or Tenant-isolation boundary.

The 2026-Q3 Technology Stack Review says to evolve the current portable application architecture selectively rather than re-platform it. The linked cloud decision remains at technical-PoC stage and Confluence ADR-005 remains `Proposed`. This ADR is therefore provider-neutral and does not claim a selected cloud, region, edge product, or deployed production environment.

## Decision summary

The Platform Control Plane uses the two existing repositories and four separately deployed runtime artifacts:

| Repository | Artifact | Trust role |
| --- | --- | --- |
| `conference-manager` | Existing customer browser application | Untrusted customer presentation for Employee, Conference Manager, and Tenant Admin |
| `conference-manager` | New Platform Operator browser application | Untrusted privileged-intent presentation for authenticated Platform Operators |
| `conference-manager-api` | Existing customer API process | Customer identity, Tenant context, customer authorization, and customer business APIs |
| `conference-manager-api` | New Platform API process | Dedicated operator identity/session, Platform authorization, Platform APIs, and Platform audit |

The operator frontend is a separate deployable artifact in `conference-manager`, not a third repository. The Platform API is a separate process and composition root in `conference-manager-api`, not a third backend repository and not another route family in the customer process.

The customer and operator applications each use their own HTTPS origin and same-origin API. CORS remains disabled for normal operation.

## Topology and routing

The logical production topology is:

```text
Customer browser
  -> https://app.<deployment-domain>/
       -> customer frontend artifact
       -> /api/* -> customer API process

Platform Operator browser
  -> trusted operator network / identity-aware edge access
  -> https://ops.<deployment-domain>/
       -> operator frontend artifact
       -> /api/v1/platform/* -> Platform API process

Customer API process ---------+
                              +-> PostgreSQL 18
Platform API process ---------+   with separate runtime roles
```

`app` and `ops` are logical host labels. Issue #113 owns the actual provider, region, DNS names, certificates, edge implementation, and infrastructure as code. Any chosen names must preserve two distinct origins and the routing rules below.

| Request | Required result |
| --- | --- |
| Customer origin `/` | Customer artifact only |
| Customer origin `/api/*` excluding Platform namespace | Customer API process |
| Customer origin `/api/v1/platform/*` | Not routed; fail closed as not found |
| Operator origin `/` | Operator artifact only |
| Operator origin `/api/v1/platform/*` | Platform API process |
| Operator origin other customer API paths | Not routed; fail closed as not found |
| Wrong Host or Origin at either API process | Rejected before application dispatch |

Pilot and Production expose the operator origin only through the approved operator network or identity-aware access layer. That edge control is defense in depth; it never replaces Platform authentication and authorization in the API.

## Frontend artifact and module ownership

The existing `index.html`, `src/app.js`, and `src/platform/` remain the customer application. In this repository, `src/platform/` means customer application-wide shell, session, and infrastructure-facing composition; it must not acquire Platform Operator meaning.

Issue #130 will introduce the operator artifact with these ownership boundaries:

- Production entry point `platform-admin/index.html`, bootstrapped by `src/platform-admin/production/bootstrap.js`;
- composition and capability modules under `src/platform-admin/`;
- independently deployable static-file manifest;
- no imports from `src/employee/`, `src/manager/`, `src/tenant-admin/`, customer `src/platform/`, or customer `src/app.js`;
- reuse limited to approved design tokens and explicit stable presentation/localization contracts;
- no customer session adapter, customer role state, LocalStorage authority, or Production-to-Demo fallback.

The customer deployment must exclude the operator entry point. The operator deployment must exclude the customer entry point and private customer capability modules except for explicitly reviewed shared static assets. A source-repository compromise remains a common supply-chain risk, so operator changes require the privileged review and security gates defined below even though deployment artifacts are separate.

The isolated SaaS 3 Demo Control Plane from #132 is a distinct non-production deployment/composition. Its entry point is `platform-admin-demo/index.html`, bootstrapped by `src/platform-admin/demo/bootstrap.js`. It uses deterministic in-memory Demo adapters, is visibly identified as Demo, contains no Production credentials, and never accepts a Production customer or operator session. Failure of a Production operator API or session must not select Demo behavior.

## Backend process and composition ownership

The existing `conference-manager-api/src/index.js` and customer application composition remain customer-only. They must never import or register Platform route modules or load Platform identity/session/audit secrets.

The backend will add a separate Platform composition root and process, expected under `src/platform/index.js` and `src/platform/app.js`. It owns only Platform authentication/session routes, `/api/v1/platform/*` route registration, Platform authorization, approved operator use-case adapters, and Platform audit presentation. It must not register customer Employee, Conference Manager, Tenant Admin, onboarding-claim, or customer-session routes.

Shared transport primitives such as safe request-target validation, exact Host/Origin checks, bounded JSON processing, security headers, request IDs, and the route-module registry should be reused through principal-neutral contracts. The Platform process must not import the customer Principal merely to reuse HTTP helpers.

The two processes may use the same versioned backend release and PostgreSQL cluster. Separate processes are required even when deployment places them on the same compute product. Combining them into one dispatcher requires a new accepted architecture decision.

## API namespace and dependency direction

All browser-facing operator endpoints live below `/api/v1/platform/*`, including operator authentication/session endpoints, health/readiness endpoints intended for that workload, audit reads, and business operations.

The mandatory dependency direction is:

```text
Platform HTTP route module
  -> Platform authorization and target-scoping adapter
     -> existing onboarding/readiness/lifecycle/entitlement/recovery application service
        -> application persistence port
           -> PostgreSQL adapter
```

Rules:

- HTTP modules own exact paths, methods, positive schemas, bounded responses, CSRF invocation, and safe error mapping.
- Platform authorization adapters own operator permission, assurance, and target-Tenant scope checks.
- Existing application services remain the sole owners of lifecycle transitions, readiness derivation, entitlement capability rules, invitation behavior, and recovery preconditions.
- PostgreSQL and provider clients remain infrastructure details and are never imported by Platform HTTP modules.
- No generic command, action, CRUD, SQL, Graph, log-query, expression, or impersonation endpoint is permitted.
- A combined existing service may be split into cohesive reusable use cases when needed to remove customer-origin/session configuration from the Platform process; its rules must be moved, not copied.
- Every request ID/correlation ID is server-generated. A separately validated idempotency key may express retry intent but never replaces the server request ID or grants authority.

The existing process-local CLI remains a second adapter to these same services, not a second implementation.

## Platform identity and authorization boundary

Normal Platform access uses a dedicated single-tenant Microsoft Entra workforce application registration in the approved internal operator Tenant. Deployment supplies the exact Tenant ID, client ID, and registered redirect URI. The Platform adapter validates signature, exact issuer, audience, Tenant, state, nonce, PKCE, time, and the approved assurance context before resolving a local operator.

Customer Entra Tenants, customer identities, customer sessions, Tenant roles, provider groups, email domains, display names, and browser-submitted claims never create Platform authority. Operators are pre-provisioned or explicitly approved in the server-side Platform identity store; there is no customer-to-operator JIT path.

The initial Platform roles and permission sets are:

| Role | Initial permissions |
| --- | --- |
| `platform_support_reader` | `platform:tenant:read`, `platform:readiness:read`, `platform:integration-health:read`, `platform:diagnostics:read`, `platform:entitlement:read` |
| `platform_tenant_operator` | Reader permissions plus `platform:invitation:manage`, `platform:lifecycle:manage`, `platform:entitlement:manage` |
| `platform_security_auditor` | `platform:tenant:read`, `platform:diagnostics:read`, `platform:audit:read`, `platform:audit:export` |
| `platform_security_admin` | `platform:tenant:read`, `platform:recovery:execute`, `platform:audit:read`, `platform:operator:manage` |

Roles may be combined only through server-side assignment. No role silently inherits a customer role, and `platform_security_admin` is not an unrestricted superuser. Unknown roles or permissions invalidate the complete operator authorization snapshot. Operator target scope is server-owned and is either an explicit Tenant allowlist or the separately approved fleet scope; a browser-selected Tenant never broadens it.

Normal access requires enterprise MFA enforced through the approved Conditional Access policy or an equivalent reviewed control. Repository claim validation and external Conditional Access evidence are both required; the application must not infer policy enforcement from an unreviewed browser claim alone.

High-impact operations require a recent stronger assurance/reauthentication result in addition to the normal session. This includes invitation issue/revoke, lifecycle mutation, entitlement mutation, recovery, identity unbinding, operator administration, and sensitive audit export. Issue #128 owns the exact bounded session and step-up lifetimes; the maximum accepted step-up age must not exceed five minutes without a new architecture/security review.

## Session, cookie, and CSRF separation

Platform sessions are server-generated opaque credentials stored only as hashes in a dedicated Platform session table. They have independent expiry, rotation, revocation, privilege-version invalidation, and CSRF derivation.

| Concern | Customer boundary | Platform boundary |
| --- | --- | --- |
| Session cookie | `cm_session` | `cm_platform_session` |
| OIDC transaction cookie | `cm_oidc_tx` | `cm_platform_oidc_tx` |
| Session lookup | Customer session table and Principal | Platform session table and Principal |
| Cookie origin | Customer origin | Operator origin |
| Cookie path | Existing customer API path | `/api/v1/platform` |
| CSRF key/token | Customer-specific | Platform-specific |
| OIDC registration/secret | Customer application | Dedicated operator application |

Pilot and Production cookies are `Secure`, `HttpOnly`, `SameSite=Lax` or stricter when compatible with the OIDC callback, host-only, and have no `Domain` attribute. State-changing requests require the Platform session plus a session-bound Platform CSRF token. Provider access, refresh, and ID tokens never enter LocalStorage, sessionStorage, normal logs, audit payloads, or public API responses.

A customer cookie sent to the operator workload resolves no Platform Principal. A Platform cookie sent to the customer workload resolves no customer Principal. Session rotation occurs after authentication, step-up, and privilege changes. Revocation and stale privilege checks use authoritative persistence time rather than application-instance clock assumptions.

## Configuration and secret boundaries

The customer process keeps its existing configuration namespace. The Platform process uses a separately validated namespace, including at least:

- `PLATFORM_PUBLIC_ORIGIN`;
- `PLATFORM_ENTRA_TENANT_ID`;
- `PLATFORM_ENTRA_CLIENT_ID` and `PLATFORM_ENTRA_CLIENT_SECRET`;
- `PLATFORM_OIDC_TRANSACTION_SECRET`;
- `PLATFORM_CSRF_SECRET`;
- `PLATFORM_AUDIT_HMAC_SECRET`;
- `PLATFORM_CURSOR_SECRET`;
- `PLATFORM_DATABASE_URL` or an equivalent separately injected Platform database credential;
- bounded Platform session and step-up lifetime settings.

Pilot and Production fail startup when required Platform configuration is absent, malformed, insecure, or aliases the corresponding customer credential. Customer identity/session/audit configuration never falls back for a missing Platform value, and Development/Demo defaults never activate in Pilot or Production.

The Platform runtime may receive the existing Tenant-audit integrity key only through a separately authorized secret reference when an approved customer-impacting mutation must append Tenant audit evidence in the same transaction. This narrow exception does not permit loading customer Entra, customer OIDC transaction, customer session, or customer CSRF secrets. Platform audit always uses its own key.

Secrets remain in the selected managed secret/KMS boundary and never in source, browser storage, build artifacts, logs, issue comments, or documentation examples. Issue #113 owns the external secret delivery and rotation implementation.

## Persistence and database roles

PostgreSQL 18 remains authoritative under the current repository baseline. One database cluster preserves atomic mutation plus Tenant/Platform audit commits and avoids a distributed transaction or duplicated service. It does not mean both runtimes use one unrestricted credential.

The deployment defines at least three roles:

| Role | Access |
| --- | --- |
| Migration owner | Versioned schema migration only; not an application runtime credential |
| Customer runtime | Existing customer/Tenant tables and Tenant audit required by customer services; no Platform identity, session, authorization, or audit table access |
| Platform runtime | Platform identity/session/audit/idempotency tables plus the minimal Tenant directory, onboarding, lifecycle, entitlement, recovery, and Tenant-audit append privileges required by approved use cases |

The Platform runtime does not receive arbitrary database-owner, migration, extension, schema-creation, or unrestricted table access. The browser never connects to PostgreSQL. Direct SQL remains an emergency infrastructure procedure, not a Control Plane capability or normal operator workflow.

Database role provisioning and grants are deployment/IaC responsibilities under #113, with executable integration checks in `conference-manager-api`. A future separate Platform database would require a new decision because it would change the atomic audit and service-reuse model.

## Separate Platform audit domain

Platform audit is independent from Tenant-visible audit in schema, authorization, persistence tables, integrity key, query service, API presentation, retention policy, and database grants.

Platform events derive the operator, assurance/authorization snapshot, resolved target Tenant, action, safe previous/new state, outcome, UTC time, and request/correlation ID from trusted server context. The browser cannot forge, suppress, or select authoritative audit fields. Credentials, invitation tokens, provider tokens, sessions, CSRF values, raw claims, provider payloads, audit keys, and unnecessary customer content are prohibited.

Required Platform session mutations and approved privileged Tenant mutations append Platform evidence atomically with the authoritative database change. Customer-impacting mutations also retain the existing Tenant-facing audit event in that transaction. Failure of either required audit append rolls back the mutation. Security-relevant denied and failed attempts are recorded separately when a trusted context exists without leaking object existence.

Tenant Admin and every other customer Principal have no Platform audit permission. The customer API process and customer database role cannot read Platform events. Platform audit reads and exports require independent permissions, integrity verification, bounds, and audit of the read/export itself.

Issue #100 owns the event taxonomy, append-only schema, HMAC/checkpoint implementation, retention classes, query/export bounds, concurrency tests, and rollback guards. External anchoring or WORM export may be evaluated later and must not be claimed until implemented and evidenced.

## CLI and break-glass boundary

The process-local CLI remains available only when the normal Platform path is unavailable or the approved runbook explicitly requires it. It must invoke the same application services and transactional audit paths as Platform HTTP; it must not bypass authorization, validation, Tenant targeting, lifecycle rules, or audit.

Each break-glass invocation requires a server-verifiable grant issued and custodied outside the normal application path. The grant is:

- attributable to one operator, never a shared ordinary administrator;
- restricted to exact actions and target Tenants;
- reason/ticket bound;
- single-use and replay protected;
- time bounded to no more than one hour;
- subject to alerting and Platform audit;
- unavailable for issuing another break-glass grant or opening a generic console.

Required Platform audit failure prevents a break-glass business mutation. Infrastructure credential custody, approval, and alert routing are external evidence owned by #104 and the selected deployment/IAM implementation. Direct database changes are outside this fallback and follow a separately approved incident procedure.

## Support and impersonation decision

Support access is diagnostics and explicitly approved recovery, not unrestricted customer impersonation. Operator views expose the minimum operational state required for the task. Customer Requests, personal data, free text, provider payloads, and credentials are absent by default.

Any future scoped customer-data view requires its own requirement, purpose, permission, assurance, target-Tenant check, data-minimization review, audit, and retention decision. No current SaaS 3 capability may create a general impersonation or “view as customer” session.

## Repository and delivery ownership

| Owner | Responsibilities |
| --- | --- |
| `conference-manager` | Separate operator artifact, browser API/session adapters, accessible and localized presentation, explicit Production/Demo composition, artifact isolation, frontend architecture gates, browser tests |
| `conference-manager-api` | Platform Principal/session/OIDC, authorization and target scope, `/api/v1/platform/*`, service adapters, persistence/migrations, Platform audit, CLI/break-glass enforcement, backend architecture/security/DB tests |
| #113 deployment/IaC | Actual origins, DNS/TLS, edge routing/access layer, workload separation, runtime DB roles, managed secrets/KMS, EU region, shared abuse controls, telemetry and backup/restore |
| #103 security release gate | Privileged end-to-end tests, deployed operator-origin tests, DAST, penetration-test scope and evidence |
| #104 operations readiness | Operator access lifecycle, break-glass custody/approval, monitoring/alerting, rollback, recovery, escalation, and runbook evidence |

Operational logs and metrics remain distinct from both audit domains. They use fixed low-cardinality route/outcome fields and exclude Tenant, operator, User, credential, target-resource, and customer-content dimensions. Authorized Tenant-specific operational views use an explicit Platform read model rather than adding Tenant labels to general telemetry.

## Threat-to-control mapping

| Threat | Required controls and evidence |
| --- | --- |
| Privileged identity/session theft or fixation | Dedicated fixed-Tenant OIDC, MFA/Conditional Access, opaque hash-only sessions, rotation, bounded expiry, revocation, stale-privilege invalidation, step-up, fixation/replay tests |
| Customer-to-operator escalation | Separate origins, registrations, cookies, tables, Principals, roles, processes, DB grants, customer-route denial, no JIT promotion |
| Confused deputy | Server-derived Platform Principal and target scope, explicit target Tenant, exact use-case routes, no generic command endpoint, negative parity tests |
| BOLA/IDOR and target-Tenant manipulation | Operator permission plus server-owned fleet/allowlist scope, target-scoped repository queries, concealed failures, cross-target tests |
| CSRF | Exact operator Origin, SameSite cookie, session-bound Platform CSRF on every unsafe request, negative browser/API tests |
| Information disclosure | Minimized schemas, stable safe errors, no customer content by default, redaction corpus, response/log/metric/audit bounds |
| Operator-origin compromise | Independent artifact and CSP, no browser-held provider/session tokens, backend authorization on every request, short session/step-up windows |
| Audit suppression or tampering | Server-owned event fields, separate append-only integrity domain, transaction-required audit, fail-closed reads, DB-role isolation, concurrency/tamper tests |
| Break-glass misuse | Individually attributable externally custodied grant, exact action/target, reason/ticket, one-time expiry, alerting, Platform audit, no generic console |
| Supply-chain compromise | Minimal dependencies, locked installs, dependency review, secret scanning, static/architecture gates, separate artifact review/deployment, protected release workflow |
| Network/deployment confusion | Exact Host/Origin validation, operator-only edge route, distinct workloads and secrets, customer/operator negative routing checks, deployed evidence |
| Resource exhaustion | Bounded request/response/query/export sizes, strict Platform rate limits, shared edge controls, pagination, no unbounded audit verification |

## Architecture and security gates

Implementation must extend automated gates rather than rely on this document alone.

Frontend gates must reject:

- customer entry-point imports of `src/platform-admin/`;
- operator imports of customer capability internals or customer session/runtime authority;
- a deployment manifest that serves both entry points on one Production origin;
- Production-to-Demo fallback or Demo credentials in Production composition;
- circular dependencies and unregistered parallel localization or API mechanisms.

Backend gates must reject:

- Platform routes or operator authorization in the customer composition;
- customer routes or customer Principal/session resolution in the Platform composition;
- HTTP imports of concrete persistence, provider, configuration, or composition modules;
- application-service imports of HTTP or concrete persistence;
- direct HTTP reuse of the CLI command dispatcher;
- duplicate route ownership, cycles, generic command endpoints, and provider/persistence leakage.

Required executable evidence includes:

- exact role/permission/assurance matrices and unknown-value denial;
- customer-to-Platform and Platform-to-customer session/origin negative tests;
- CSRF, fixation, expiry, rotation, revocation, replay, stale privilege, and step-up tests;
- wrong issuer/audience/Tenant and malformed-claim tests;
- target-Tenant/BOLA/confused-deputy and concurrent mutation tests;
- migration, DB-grant, append-only, integrity, audit-atomic rollback, and redaction tests;
- service-parity tests between HTTP and the process-local adapter;
- Chromium and WebKit/iPhone operator UI coverage where applicable;
- deployed operator-origin E2E, DAST, and penetration-test evidence before production release.

Repository tests prove only the controls they execute. They do not prove the deployed edge, Entra registration, Conditional Access, secret custody, DB grants, backup/restore, DAST, or penetration test.

## External dependencies and non-claims

This decision is implementable before the production platform is selected because it defines provider-neutral trust boundaries. It does not close or supersede:

- #73, the Microsoft enterprise Pilot readiness and operations evidence gate;
- #74 and #91, the SaaS 2 product/self-service release and external acceptance gates;
- #113, the provider/region/IaC/secret/edge/DB-role/telemetry/backup decision and evidence;
- #128 external Entra, MFA/Conditional Access, HTTPS, and break-glass evidence;
- #129 deployed privileged-API DAST and penetration-test evidence;
- #103 and #104, the SaaS 3 security and operations release gates.

Relevant current external sources:

- [2026-Q3 Technology Stack Review](https://acckreutzer-1733338800840.atlassian.net/wiki/spaces/~5de0302805eece0d0920638f/pages/721014): baseline review completed on 2026-08-24; retain the current portable architecture and evolve the production operating stack selectively.
- [EU Cloud Provider Decision & PoC](https://acckreutzer-1733338800840.atlassian.net/wiki/spaces/~5de0302805eece0d0920638f/pages/655598): decision ready, but technical PoC required before acceptance.
- [ADR-005](https://acckreutzer-1733338800840.atlassian.net/wiki/spaces/~5de0302805eece0d0920638f/pages/590007): still `Proposed` as of 2026-08-24.

Consequently this ADR does not name a cloud provider or region, claim S2/S3 sovereignty, claim an active operator origin, or claim that external identity/security/operations acceptance has occurred.

## Alternatives considered

### Embed Platform controls in Tenant Admin

Rejected. Tenant Admin is a customer role and capability. Embedding privileged controls would create role confusion, a larger customer-origin attack surface, and a path from customer identity to fleet authority.

### Serve both applications and APIs from one origin/process

Rejected. Path and role checks alone do not provide the required operational, cookie, IdP, deployment, and blast-radius separation. The customer same-origin contract remains unchanged; the operator application gets its own same-origin contract.

### Create third frontend and backend repositories

Rejected for current scope. A third frontend repository would duplicate the build-free architecture, localization, design, and security governance. A third backend repository would force copied business rules or a privileged service-to-service API and make audit atomicity harder. Separate artifacts and processes in the current owning repositories provide the required isolation without parallel implementations.

### Keep terminal-only operations

Rejected as the normal target. The CLI is useful controlled fallback but does not provide scalable least-privilege identity, browser usability, fleet views, or normal operational evidence.

### Expose a generic command, database, Graph, or impersonation console

Rejected. Such surfaces cannot preserve exact positive schemas, bounded permissions, target integrity, data minimization, or deterministic audit and recovery semantics.

### Reuse customer Entra and session authority

Rejected. A customer Tenant or role administration path must never mint fleet authority, and shared cookies, secrets, tables, or resolvers create unacceptable credential-confusion and escalation risk.

## Consequences

Positive consequences:

- existing customer origin/session/CORS/Tenant boundaries remain unchanged;
- existing application services and one PostgreSQL transaction model are reused;
- Platform identity, sessions, audit, deployment, and DB privileges are independently controlled;
- normal operations no longer require terminal or database access after the owning capabilities ship;
- Demo parity can be implemented without Production credentials or customer-shell coupling;
- the topology remains cloud-provider-neutral and compatible with the current Node.js/PostgreSQL architecture.

Costs and trade-offs:

- two frontend deployments and two backend processes require additional DNS, certificates, release orchestration, monitoring, secrets, and incident procedures;
- the two source repositories remain a shared supply-chain boundary, requiring stronger review and separate artifact deployment controls;
- one PostgreSQL cluster preserves atomicity but creates a shared infrastructure dependency, mitigated by separate runtime roles and backups;
- the Platform runtime holds more deliberate Tenant mutation authority than the customer runtime and therefore needs stronger identity, assurance, audit, testing, and operational controls;
- external Entra, edge, IaC, DB-role, DAST, penetration-test, and break-glass evidence remains required before production use.

## Implementation and integration order

1. Keep #134 modular architecture gates as the permanent prerequisite.
2. Implement #128 dedicated Platform identity, session, MFA/Conditional Access contract, and Platform-only composition root.
3. Implement #100 separate Platform audit and integrate session/break-glass evidence.
4. Complete narrow directory, invitation-revocation, optimistic-concurrency, idempotency, and dual-audit service/persistence contracts.
5. Implement #129 explicit Platform route modules over those services.
6. Implement #130 operator artifact and Tenant directory against the stable API.
7. Complete #93–#101 operator capabilities and #132 isolated Demo parity.
8. Complete #103 deployed security evidence and #104 operations readiness.
9. Use #73, #91, and #113 evidence before any external production-readiness claim.

Implementation remains sequential across identity, audit, shared mutation transactions, and API composition because those surfaces are coupled. Threat analysis, test design, documentation review, and frontend presentation work may proceed in parallel only after their consumed contracts are stable.

## Acceptance of this decision

This ADR satisfies #92 when merged because it records:

- concrete artifacts, repositories, processes, origins, routing, API namespace, and dependency direction;
- customer/operator identity, session, cookie, CSRF, secret, and DB-role separation;
- exact initial Platform roles and permissions, MFA/Conditional Access, step-up, target scope, and break-glass boundaries;
- reuse of existing services and the retained CLI role;
- separate Platform audit ownership and dual-audit atomicity;
- support/impersonation limits;
- repository, deployment, security-gate, runbook, and external-evidence ownership;
- the required threat model, alternatives, consequences, and integration order.

No source/runtime implementation or external deployment evidence is claimed by this architecture decision.

Issue #92 is internally verifiable through the accepted decision and repository documentation and does not itself require `external-acceptance-evidence`. External identity, infrastructure, security-test, and operations evidence remains on the owning implementation and release-gate issues listed above.

## Revisit triggers

A new architecture decision is required before:

- serving customer and Platform applications from one Production origin;
- registering customer and Platform APIs in one process;
- moving the Platform frontend or backend to another repository;
- accepting customer identity/session/RBAC as Platform authority;
- introducing customer impersonation or a generic privileged console;
- moving Platform data to a separate database in a way that changes mutation/audit atomicity;
- enabling cross-origin browser API access;
- weakening the separate secret, cookie, DB-role, audit, or edge boundaries defined here.

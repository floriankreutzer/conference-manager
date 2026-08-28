# SaaS Production Topology Decision

## Status

Accepted for **SaaS 0 / Multi-Tenant Foundation**.

Tracking issue: #46  
Parent roadmap: #44  
Decision date: 2026-08-23

This decision is subordinate to root `AGENTS.md`, `docs/CODING-STANDARDS.md`, `docs/ARCHITECTURE.md`, `docs/BASELINE.md`, and `docs/PRODUCTION-SECURITY.md`. If any future implementation conflicts with those sources, the repository standards win until an explicit reviewed architecture change updates the baseline.

## SaaS 3 control-plane extension

`docs/SAAS3-PLATFORM-CONTROL-PLANE.md`, accepted on 2026-08-28 for #92 and roadmap #75, extends this topology with a separate operator origin, operator frontend artifact, and Platform-only backend process. The extension leaves this document's customer same-origin contract unchanged: the customer browser and customer `/api/*` remain on one customer origin with the existing customer session and CORS assumptions.

The operator application has its own same-origin contract under a different HTTPS origin and routes only `/api/v1/platform/*` to the dedicated Platform process. Customer and operator identity registrations, Principals, cookies, CSRF keys, secrets, database runtime roles, and audit domains are separate. Neither process registers the other process's routes, and the customer origin does not route the Platform namespace.

Both backend processes remain in `conference-manager-api` so they can reuse the existing application services and preserve atomic Tenant mutation plus Tenant/Platform audit transactions. Both browser artifacts remain in `conference-manager` but are independently deployed. This is not permission to place operator controls in Tenant Admin or existing customer `src/platform` modules.

## Decision summary

The production SaaS backend will be implemented in a dedicated repository named `conference-manager-api`.

The existing `conference-manager` repository remains the browser application and explicit demo runtime. It must not absorb server-side authentication, authorization, tenant isolation, database access, integration credentials, audit persistence, or Microsoft Graph service credentials into `src/platform`, `src/core`, or another browser module.

Production deployment is **logically same-origin**:

```text
https://<conference-manager-host>/
  -> static Conference Manager web application

https://<conference-manager-host>/api/*
  -> trusted conference-manager-api backend
```

A reverse proxy, gateway, or equivalent deployment layer may route the two workloads internally, but the browser sees one HTTPS origin. CORS remains disabled by default. The existing defensive client contract in `src/core/api-client.js` remains the frontend boundary.

The application-level topology is infrastructure-provider-neutral. A specific cloud compute product, container platform, HTTP framework, ORM, and relational database implementation may be selected by the owning follow-up issue without changing the trust boundaries defined here. A change from the dedicated-backend/same-origin model requires a new explicit architecture decision.

## Why a separate backend repository

A dedicated backend repository is required because the current repository has a deliberately build-free native ES-module browser architecture and treats the static client as an untrusted presentation tier.

The separation provides these properties:

- no accidental conversion of frontend modules into server-side trust boundaries;
- independent backend dependency, migration, deployment, secret, SAST, SCA, and runtime-security controls;
- independent release cadence while preserving a stable HTTP contract;
- clear ownership of server-side tenant isolation, authorization, persistence, audit, and integration logic;
- no framework or build-tool migration in the existing frontend repository;
- easier review of changes that affect privileged backend behavior.

The repositories may share documented contracts, identifiers, and test fixtures where explicitly governed, but they must not depend on ad-hoc copied business logic or unpublished source-file imports across repositories.

## Production request path and trust boundaries

```text
Untrusted browser
  |
  | HTTPS, same origin, secure session cookie + CSRF protection
  v
Edge / reverse proxy / gateway
  |
  | /api/*
  v
Trusted Conference Manager API
  |-- authenticated principal/session boundary
  |-- tenant resolution and tenant lifecycle enforcement
  |-- server-side RBAC and object ownership authorization
  |-- positive-schema input validation
  |-- application/use-case services
  |-- transactional booking boundary
  |-- audit/event creation
  |-- entitlement evaluation
  |
  +--> Relational persistence boundary
  |
  +--> Managed secret/credential store
  |
  +--> Identity adapter --> Microsoft Entra ID / future IdPs
  |
  +--> Integration adapters --> Microsoft Graph / future providers
```

### Browser boundary

The browser is untrusted. It may submit identifiers, form values, requested transitions, and presentation state, but none of these values establish authorization, tenant identity, ownership, price, entitlement, availability, or workflow authority.

Production browser storage is not an authority for roles, tenant identity, sessions, requests, catalogs, pricing, entitlements, or integration state. The current LocalStorage/sessionStorage behavior remains an explicit demo compatibility path only until #56 migrates production persistence.

### Edge / routing boundary

The public edge terminates HTTPS and exposes one application origin. It routes static application requests to the frontend artifact and `/api/*` to the backend service.

Required production properties include:

- HTTPS only;
- HSTS and the security-header baseline from `docs/PRODUCTION-SECURITY.md`;
- no wildcard CORS requirement for the normal application path;
- bounded request sizes and timeouts;
- no arbitrary upstream selection from user input;
- correlation/request ID propagation without trusting a client-supplied ID as unique or authoritative.

### API boundary

`conference-manager-api` is the first trusted business boundary. It owns server-side authentication/session validation, tenant resolution, authorization, validation, persistence orchestration, audit generation, entitlement enforcement, booking integrity, and integration calls.

Every protected operation must derive the internal principal and tenant context from the validated server-side session. Client-supplied user IDs, tenant IDs, roles, ownership fields, status values, prices, or provider identifiers are never sufficient authority.

### Identity-provider boundary

Microsoft Entra ID is an external identity provider for the first pilot wave. Provider tokens and claims are untrusted until signature, issuer, audience, nonce/state, time, tenant/account policy, and relevant protocol requirements are validated by the backend identity adapter.

Provider-specific claims must be translated into the internal principal/session contract from #50. Employee/Manager business services must not consume raw Microsoft claims.

### Persistence boundary

Persistent production data is server-side. The concrete relational implementation and migration tooling are selected in #49.

The persistence model must support explicit tenant ownership, referential integrity, transactional writes, tenant-safe queries, versioned migrations, backup/restore, and deterministic failure handling. Database constraints must reinforce application-level tenant and booking integrity where practical.

### External integration boundary

Microsoft Graph and future external providers are outbound integrations, not trusted internal services. Adapters must use fixed/allowlisted provider destinations, validate response shapes, classify errors, enforce timeouts and retry bounds, and never let user input select arbitrary outbound URLs.

Provider-specific code stays behind provider-neutral contracts defined by #54 and later Microsoft implementation issues.

## Repository ownership

### `conference-manager`

Owns:

- browser application and presentation behavior;
- Employee and Manager frontend capability boundaries;
- canonical frontend i18n/l10n;
- frontend design system and accessibility behavior;
- explicit demo runtime and demo persistence compatibility;
- defensive same-origin API client contract;
- browser-facing progression/regression/E2E tests;
- frontend architecture gates and browser security checks.

Does **not** own production authorization, tenant isolation, production database persistence, integration credentials, backend audit authority, or productive Microsoft Graph credentials.

### `conference-manager-api`

Owns:

- HTTP API and API contract;
- authenticated principal and secure server session;
- tenant lifecycle and tenant context;
- server-side RBAC, object ownership, workflow authorization, and deny-by-default policy;
- positive-schema input validation and bounded request processing;
- authoritative persistence and database migrations;
- tenant-scoped audit/security events;
- tenant entitlements and effective-capability evaluation;
- transactional booking/availability authority;
- identity adapters;
- provider-neutral integration contracts and provider adapters;
- secret/credential references and server-side integration credential access;
- health, readiness, observability, and operational diagnostics;
- backend security, dependency, migration, isolation, and integration tests.

The new repository must contain its own root `AGENTS.md` before implementation begins. Its engineering rules must be equivalent to or stronger than the security, testing, change-control, and evidence requirements in this repository. It must not weaken the browser repository's controls to simplify backend delivery.

## Data and secret placement

| Data / capability | Authoritative location | Browser visibility |
| --- | --- | --- |
| Tenant record and lifecycle | Backend persistence | Read-only subset as authorized |
| Internal users and roles | Backend persistence | Authorized subset |
| Tenant configuration | Backend persistence | Authorized subset |
| Requests/bookings | Backend persistence | Authorized subset |
| Catalog/master data | Backend persistence | Authorized subset |
| Tenant entitlements | Backend persistence/operator boundary | Effective authorized state only |
| Feature rollout state | Owning rollout mechanism | Effective presentation state only |
| Audit events | Append-only/tamper-evident backend persistence | Authorized tenant-safe subset |
| Entra/Graph secret material and tokens | Managed server-side secret/credential store | Never |
| Integration metadata/references | Backend persistence | Non-sensitive authorized subset |
| Session credential | Server-managed secure cookie/session store | Cookie opaque to JavaScript |
| CSRF token | Backend-issued CSRF mechanism | Only the value required by the client protocol |
| Demo LocalStorage/sessionStorage | Browser demo runtime only | Demo only; never production authority |

Integration secrets and refresh/access tokens must not be stored in source control, browser storage, logs, analytics payloads, or tenant-readable configuration. Backend persistence may store only the minimum non-secret metadata and opaque secret references required to locate managed credential material.

## Environment model

Four environment classes are defined:

1. **Development** — local/developer runtime. The existing static demo remains available. Backend development uses non-production identities, data, credentials, and isolated persistence.
2. **Test** — automated/integration environment with deterministic fixtures, isolated tenants, ephemeral or resettable data, and no production credentials.
3. **Pilot** — externally usable production-like environment for the controlled Microsoft enterprise pilot. It uses production-grade security controls, separate data/secrets/identity configuration, monitoring, backup/restore expectations, and tenant-isolation gates.
4. **Production** — general production environment with independently managed secrets, data, identity registrations/configuration, deployment controls, observability, recovery, and release evidence.

Environment separation rules:

- production credentials, databases, secrets, and identity registrations are not reused in development or automated test;
- pilot and production data stores are separate unless an explicit migration plan promotes data;
- configuration is supplied through deployment/runtime configuration, not source-code edits;
- no environment may silently fall back from backend persistence to browser LocalStorage after an API or database failure;
- environment identifiers are server-controlled and must not be accepted as arbitrary client routing input.

## API contract and versioning direction

The frontend continues to call relative same-origin paths under `/api/` through `src/core/api-client.js`.

The backend repository owns the machine-readable API contract. Contract-breaking changes require explicit compatibility handling and coordinated frontend/backend rollout. Generated clients, shared packages, or a new frontend build step are not introduced by this decision; any such change requires separate architectural review because the current frontend remains build-free.

Structured error responses must be safe for users and clients: stable error codes/correlation IDs may be returned, but stack traces, SQL/provider internals, credentials, tokens, and sensitive configuration must not be exposed.

## Session and CSRF direction

Production authentication results in a server-generated session. The browser does not persist long-lived bearer tokens.

Session behavior follows `docs/PRODUCTION-SECURITY.md`, including `Secure`, `HttpOnly`, appropriate `SameSite`, narrow cookie scope, rotation, expiry, and revocation. State-changing cookie-authenticated requests require backend-issued and backend-validated CSRF protection compatible with the existing `src/core/api-client.js` contract.

Exact identity-provider/OIDC behavior is implemented in #50 and #58; this topology deliberately keeps those provider details behind the backend identity boundary.

## Tenant-isolation direction

Tenant identity is an internal server-side security boundary. The API resolves tenant context from the authenticated principal/session, not from an independently trusted request header, query parameter, route parameter, or JSON field.

Every tenant-owned object must have an explicit ownership model. Cross-tenant object identifiers are authorization failures even when the identifier is otherwise valid. The detailed tenant model and static/runtime enforcement are implemented in #48.

## Audit and observability direction

Security-relevant and workflow-relevant audit events are generated server-side. Client-generated audit events are never authoritative.

Operational logs and metrics are separate from the business/security audit trail. Both use correlation identifiers, but logs/metrics must minimize personal data and exclude secrets, session credentials, CSRF tokens, provider tokens, and sensitive payload bodies.

Tenant-visible audit queries are tenant-scoped. Platform/operator audit is a separate authorization domain and must not be exposed through Tenant Admin permissions.

## Backend CI and security baseline

Before `conference-manager-api` can be treated as pilot-capable, its repository must enforce at least:

- deterministic formatting/linting/type/static checks appropriate to the selected backend language;
- unit tests and integration tests;
- progression tests for each new endpoint/use case;
- mandatory cross-tenant negative tests for every tenant-owned resource class;
- permission-matrix and object-ownership tests;
- database migration validation and persistence integration tests;
- dependency/SCA audit with a blocking severity policy;
- secret scanning;
- SAST/CodeQL or equivalent static security analysis appropriate to the backend stack;
- dependency review for pull requests;
- container/IaC/configuration scanning when those artifacts are introduced;
- DAST against a deployed non-production environment;
- security-header/session/CSRF negative tests;
- SSRF destination-control tests for outbound provider adapters;
- release evidence for backup/restore, rollback, and migration behavior when those capabilities are introduced.

Security automation is evidence for the controls actually executed; it must not be described as complete OWASP or regulatory compliance.

## Threat-to-control mapping for the foundation

| Threat | Primary control direction | Follow-up |
| --- | --- | --- |
| BOLA / IDOR / broken access control (CWE-639/CWE-862) | Server principal, tenant-scoped lookup, ownership/RBAC, deny by default | #48, #51 |
| Session/authentication abuse | Server session, rotation/revocation, provider validation | #50, #58 |
| CSRF (CWE-352) | Same-origin cookie session plus server-issued/validated CSRF protection | #47, #50 |
| Injection (for example CWE-89) | Positive schemas, parameter binding, database constraints | #47, #49 |
| XSS (CWE-79) | Safe frontend rendering plus CSP/security headers | existing frontend controls, #47, #57 |
| SSRF (CWE-918) | Fixed/allowlisted provider endpoints, no user-controlled outbound destinations | #54, #57 |
| Tenant data leakage | Internal tenant context, scoped persistence, negative isolation tests | #48, #49, #52 |
| Privilege escalation | Internal roles/permissions, explicit workflow authorization, session refresh | #50, #51 |
| Replay/duplicate external writes | Correlation/idempotency and transactional business handling | #54 and booking issues |
| Secret/token disclosure | Managed secret store, redaction, no browser exposure | #47, #52, #57 |

The complete SaaS threat model and secure deployment baseline are finalized in #57.

## Architecture-enforcement impact

No frontend architecture gate is weakened or removed by this decision.

Immediate frontend impact:

- no runtime code change is required for #46;
- `src/core/api-client.js` remains the defensive same-origin browser contract;
- `src/platform` remains browser/application composition and cannot become a backend service layer;
- Employee/Manager business presentation remains behind their existing public frontend contracts;
- the explicit demo runtime remains intact until a separately tested production-persistence migration is implemented under #56.

Future frontend production-mode work must add progression tests and preserve the current demo regression baseline. If a new production/runtime boundary introduces a meaningful enforceable rule, `npm run check:architecture` must be extended rather than relying on documentation alone.

The backend repository requires its own automated architecture/security gates appropriate to its chosen implementation.

## Critical path after this decision

The foundation proceeds in this order:

1. **#47** create the trusted backend and same-origin API foundation in `conference-manager-api`.
2. **#48** establish the tenant model and hard tenant isolation on that backend boundary.
3. **#49** introduce controlled relational persistence/migrations and **#50** the internal principal/secure-session contract.
4. **#51** implement server-side RBAC/object ownership and **#52** the tenant-scoped audit model.
5. **#53** implement tenant entitlements and **#54** provider-neutral booking/calendar contracts.
6. **#56** migrate production browser persistence to backend repositories/APIs while preserving the explicit demo baseline.
7. **#55** observability and **#57** threat-model/secure-configuration work progress continuously and must be complete before an external pilot readiness decision.

#47 is therefore the next blocking implementation issue.

## Deliberately deferred implementation choices

The following choices do not alter this approved topology and remain with their owning implementation issues:

- exact HTTP framework and server runtime packaging in #47;
- exact relational database and migration tooling in #49;
- exact session store and identity library in #50;
- exact audit storage/tamper-evidence mechanism in #52;
- exact observability backend in #55;
- exact cloud hosting product and infrastructure-as-code implementation, provided the same-origin, environment-isolation, secret, and trust-boundary requirements above are preserved.

If one of those choices would require cross-origin browser access, browser-held long-lived bearer tokens, production authorization in the client, backend code inside the frontend runtime, or another change to the trust model, it is no longer an implementation detail and requires an explicit reviewed architecture change.

# ADR-010: Shared Server-Backed Demo Runtime

## Status

**Accepted.** Implementation and release evidence are tracked by issues [#152](https://github.com/floriankreutzer/conference-manager/issues/152), [#153](https://github.com/floriankreutzer/conference-manager/issues/153), [#154](https://github.com/floriankreutzer/conference-manager/issues/154) and [#155](https://github.com/floriankreutzer/conference-manager/issues/155).

- Parent roadmap: [#149](https://github.com/floriankreutzer/conference-manager/issues/149)
- Decision date: 2026-08-30
- Roadmap baseline: approved roadmap version 10, 2026-08-30
- Depends on: the ownership baseline in `docs/DOMAIN-OWNERSHIP-AND-MODULE-BOUNDARIES.md`

This decision changes the Demo persistence and composition model. It does not make Demo a Production security or external-provider acceptance environment.

## Context

The SaaS 3 baseline has two explicit browser Demos:

- the Customer Demo stores authoritative profile, Tenant/persona, catalogue, Site/Room, Request and related state in browser storage;
- the Platform Admin Demo stores a mutable fleet document under `platform_admin_demo_v1` and executes lifecycle, entitlement, quota and recovery-style mutations in browser code.

Those Demos are isolated and deterministic in one browser, but they cannot prove a continuous Platform Operator -> Tenant Admin -> Employee -> Conference Manager -> Employee -> Platform journey across independent browser sessions. They also duplicate authority that already has a canonical server-side owner.

SaaS 4 will add more provider and job behavior. Retaining two independently mutable browser models would multiply lifecycle, validation, retry, audit and Tenant-propagation drift.

## Decision

Use one isolated PostgreSQL-backed Demo data model shared by two separately composed Demo API processes:

```text
Customer Demo browser
  -> Customer Demo session and Customer Demo API process
     -> isolated Demo PostgreSQL

Platform Operator Demo browser
  -> Demo Platform session and Platform Demo API process
     -> the same isolated Demo PostgreSQL
```

The browsers share canonical persisted Tenant/business objects, not session authority. The Customer Demo and Platform Demo retain separate origins, route registries, Principals, cookies, CSRF derivation, permissions, audit domains, runtime configuration and database roles appropriate to their trust domains.

The Demo backend reuses the Production domain, authorization, application/use-case, repository and migration contracts wherever the business semantics are the same. Demo-only behavior is limited to explicit composition, deterministic identity/persona adapters, deterministic external-provider adapters, seed/reset orchestration and Demo presentation.

## Runtime and process boundaries

| Boundary | Customer Demo | Platform Demo |
| --- | --- | --- |
| Browser artifact | Existing Customer Demo artifact | Existing Platform Admin Demo artifact |
| API process | Customer-only Demo composition; customer routes only | Platform-only Demo composition; `/api/v1/platform/*` routes only |
| Principal | Server-issued Demo customer Principal scoped to one seeded Tenant/User/persona | Server-issued Demo Platform Principal with server-resolved role, permissions, assurance and target scope |
| Session/CSRF | Customer Demo cookie and CSRF namespace | Separate Platform Demo cookie and CSRF namespace |
| Database role | Tenant/customer tables needed by customer services; no Platform identity/session/audit reads | Minimum Platform identity/session/audit plus approved Tenant-operation access |
| Audit | Tenant audit where canonical customer use cases require it | Separate Platform audit plus Tenant audit for customer-impacting mutations |
| Provider behavior | Deterministic provider-neutral Demo adapter | Reads projections and invokes canonical Platform services; no browser provider logic |

Sharing a database is not permission to combine API processes or use one unrestricted runtime credential. Deployment may place the processes on the same Demo host only if routing still provides their two explicit same-origin browser/API boundaries and preserves cookie/path separation. Production topology remains unchanged.

## Data model and migrations

- PostgreSQL is the sole authoritative Demo business store.
- A clean Demo environment is created with the source-controlled `conference-manager-api` migration mechanism and must reach the exact schema expected by both processes.
- Demo seeds insert canonical rows through bounded seed/repository orchestration; they do not create a second JSON document model that later needs synchronization.
- At least two stable Demo Tenants are seeded with distinct Users, roles, settings, entitlements, lifecycle/readiness, provider simulation and Request states.
- Stable internal identifiers are source-defined fixtures suitable for E2E correlation. Secret/session/token values are generated at runtime and are not committed fixtures.
- Tenant ownership, foreign keys, optimistic revisions, append-only history, audit requirements and transaction boundaries remain active in Demo.
- The browser never connects to PostgreSQL, supplies a database selector or chooses the authoritative Tenant by arbitrary identifier.

The database is isolated from Development data used for unrelated work and from every Pilot/Production database. Demo credentials, database URLs, session secrets, CSRF secrets, audit keys and provider configuration cannot alias Production values.

## Seed and reset contract

One documented reset/reseed operation restores the complete Demo system to one semantic baseline.

The reset implementation must:

1. exist only in Demo composition and be absent from Production route registries and artifacts;
2. require an explicit Demo session/authorization and CSRF protection when exposed through HTTP;
3. acquire a database-level advisory lock or equivalent exclusive reset lease;
4. reject or deterministically serialize concurrent normal mutations rather than producing partial state;
5. invalidate all Customer Demo and Platform Demo sessions before or within the reset transaction;
6. clear and recreate every seeded customer, Platform, audit, entitlement, provider-simulation, idempotency, recovery and projection record coherently;
7. preserve schema/migration history while restoring business data;
8. return only a bounded result containing a seed version and semantic checksum, never secrets or raw database details;
9. be repeatable and produce the same documented identifiers, counts and semantic checksum after every successful run;
10. roll back or fail closed if any required reset/seed step or audit invariant fails.

Production configuration cannot enable this operation. A runtime flag checked only inside a shared Production route is insufficient; the Production import graph and route registry must not contain the reset handler or Demo seed implementation.

## Identity, persona and authorization

Demo identity is intentionally simulated, but effective authority is server-owned:

- the Customer Demo offers an allowlisted Tenant/User/persona choice that results in a server-issued Tenant-scoped Demo session;
- the Platform Demo offers allowlisted operator personas, but a persona request is only input to the Demo Platform session service;
- the server resolves the selected fixture identity to the canonical role, permission, assurance and target-scope policy and returns the minimized effective session projection;
- a customer session never resolves a Platform Principal and a Platform session never resolves a customer Principal;
- changing a DOM field, query value, LocalStorage value, cookie from the other trust domain or request body role cannot expand authority;
- unknown, malformed, disabled, cross-Tenant or out-of-scope identities and permissions fail closed;
- unsafe requests remain protected by the session-specific CSRF contract.

The Demo does not simulate security by trusting browser claims. It exercises the real authorization and Tenant-scoping shape with deterministic identities and non-production keys.

## API and application-service reuse

Normal Demo business behavior uses the same versioned, Production-shaped customer and Platform HTTP contracts where practical. Demo-only session/persona and reset controls are explicitly named and registered only by Demo composition.

The following rules are mandatory:

- Customer Demo settings, User, Request, workflow, audit and capability operations call the canonical customer application services and PostgreSQL repositories.
- Platform Demo invitation, lifecycle, readiness, entitlement, quota, health, diagnostics, recovery, metering and runtime operations call the canonical Platform application services and transaction ports.
- Demo provider/identity adapters implement existing ports. They do not copy Request, lifecycle, entitlement, permission, retry, idempotency or audit rules.
- HTTP handlers remain transport owners and never import concrete PostgreSQL or provider adapters.
- A Demo API outage produces an unavailable/error presentation. No browser adapter may select LocalStorage, fixture state or browser mutation logic as fallback.
- Response validation stays positive and bounded; Demo is not permission to expose internal database/provider/audit records.

## Browser storage and presentation

After #153:

- Customer Demo browser storage is not authoritative for Tenant, User/persona permission, Site/Room, catalogue, policy, cost allocation, entitlement, Request, workflow, audit or provider state;
- Platform Admin Demo does not import or instantiate `createPlatformAdminDemoStore()`;
- `platform_admin_demo_v1` is unnecessary and may be absent or cleared without changing authoritative fleet/business state;
- no runtime module under `src/platform-admin/demo/` reads LocalStorage/sessionStorage for fleet, Tenant, operator persona, effective permission or business mutation authority;
- browser-side lifecycle, entitlement, quota and recovery implementations are removed from the active runtime graph;
- a reload, fresh browser profile or second browser observes the same server-persisted state after establishing its own appropriate Demo session.

Language preference, non-authoritative navigation state and an explicitly bounded unsaved draft may remain browser-local only when losing or modifying that state cannot change server authority. Such state must use the approved storage contract and must not be uploaded automatically as trusted data.

## Shared-state behavior

The accepted runtime must demonstrate real propagation over one canonical Tenant ID:

1. Platform Operator creates/prepares or activates a Demo Tenant using the Demo Platform API.
2. Tenant Admin opens that same Tenant through a separate Customer Demo session and updates Organization, Sites/Rooms, Catalogue, Booking Policies, Cost Allocation, Users and integration simulation as supported.
3. Employee creates a Request from the persisted Tenant configuration.
4. Conference Manager reviews and applies a supported transition to that same Request.
5. Employee reloads the server-derived status/history.
6. Platform Operator reloads the privacy-minimized readiness, health, diagnostic and audit projections for the same Tenant.

No fixture copy, browser-storage transfer, export/import step or background synchronization between independently mutable Tenant models is permitted. A second Tenant and negative cross-Tenant attempts prove that sharing the database does not weaken Tenant isolation.

## Deterministic provider behavior

The default Demo makes no real Entra, Microsoft Graph or future provider call.

Deterministic Demo adapters:

- implement the existing provider-neutral ports;
- use fixed source-controlled scenario identifiers and bounded server-persisted state where mutation/retry history is part of the behavior;
- support documented success, degraded, conflict, throttled and unavailable cases needed by tests and demonstrations;
- preserve retry/idempotency semantics owned by the canonical application service;
- never accept a caller-selected outbound URL or Production credential;
- cannot be imported or discovered by Production composition.

Real-provider acceptance remains in its external Pilot/Production evidence issues and cannot be inferred from Demo simulation.

## Production isolation and fail-closed rules

Production must be unable to discover, import or fall back to:

- Demo database URLs or credentials;
- Demo session/persona services, cookies or CSRF keys;
- Demo seed/reset functions or routes;
- deterministic Demo identity/provider adapters;
- Demo fixtures or browser stores;
- Demo origins or runtime markers as a response to a Production dependency failure.

Production startup validates its own explicit environment and configuration. If Production configuration is missing, malformed, aliases a Demo value or cannot reach its required dependencies, startup/readiness fails closed. It does not probe for Demo configuration.

Static reachability and artifact-manifest gates must protect these rules, complemented by runtime configuration, negative session/origin, database-grant and integration tests.

## Security and privacy consequences

The shared Demo strengthens architectural evidence but remains non-production:

- server-side authorization, CSRF, object ownership and Tenant-scoped queries can be tested through real HTTP boundaries;
- separate customer/Platform sessions prevent persona confusion;
- the Demo database contains synthetic data only and needs no Production credential or customer data;
- privacy-minimized Platform projections remain separate from Tenant-visible audit/data;
- logs, responses and reset results remain secret-minimized and bounded;
- Demo DAST and isolation tests prove only the exercised Demo controls, not Production identity, Conditional Access, edge, backup, penetration-test or provider security.

## Architecture and release gates

The implementation must add positive and negative executable evidence for:

- Customer/Platform Demo process, route, Principal, session, CSRF and database-role separation;
- migration checksum/schema readiness and clean database creation on PostgreSQL 18;
- seed/reset repeatability, semantic checksum, idempotency/destructive safety and concurrent reset behavior;
- same-Tenant propagation and cross-Tenant BOLA/IDOR denial;
- stale revision, concurrent mutation, session expiry/revocation and representative provider-degraded behavior;
- multi-browser persistence after complete browser-storage clearing;
- absence of `platform_admin_demo_v1`, legacy Demo store imports and browser Platform mutation authority from the active graph;
- Demo API outage with no browser-local fallback;
- Production import/reachability/configuration/artifact rejection for every Demo-only concern;
- the complete #154 journey in independent Customer and Platform browser contexts;
- frontend Chromium and WebKit/iPhone critical paths plus backend unit, PostgreSQL integration and applicable customer/Platform DAST.

Repository checks prove only their executed controls. #155 records the final merged-`main` evidence.

## Consequences

### Positive

- Customer and Platform Demos show one continuous cross-role product journey;
- authoritative state survives reload, storage clearing and browser/device handoff;
- canonical server rules replace conflicting browser mutation implementations;
- PostgreSQL migrations, Tenant constraints, revisions and audit transactions receive realistic Demo exercise;
- SaaS 4 provider work extends established ports instead of another fixture business model;
- deterministic reset makes demonstrations and CI reproducible.

### Costs and obligations

- Demo now requires PostgreSQL and two API processes in addition to static browser assets;
- local development, CI and hosted Demo operations need migration, seed, reset, health and session orchestration;
- synthetic identities still require careful server-side authorization and separation to prevent misleading security claims;
- schema and seed changes must be reviewed together and keep deterministic reset semantics;
- browser E2E must coordinate independent sessions and cannot rely on isolated page-local fixtures.

## Alternatives considered

### Keep browser LocalStorage as authority

Rejected. It cannot provide cross-browser shared state, exercises no PostgreSQL integrity/transaction model, and leaves Platform lifecycle/entitlement/recovery rules duplicated in the browser.

### Keep separate Customer and Platform Demo databases or fixture documents and synchronize them

Rejected. Synchronization would create two mutable owners, race/conflict semantics and false propagation. The Demo must reference one canonical Tenant/business model.

### Use one Demo API process and one shared session

Rejected. A combined dispatcher/session would erase the customer/Platform trust-boundary shape and create confused-deputy and privilege-escalation risk even with synthetic identities.

### Use an in-memory database, SQLite, repository files, GitHub Issues or Actions artifacts

Rejected. These alternatives do not exercise the approved PostgreSQL migrations, constraints, transaction/audit behavior or independent runtime roles. GitHub remains source and automation, not a live database.

### Reuse a Pilot/Production database or identity/provider credentials

Rejected. Demo must be independently resettable, synthetic and incapable of touching customer data or Production credentials.

### Call real Entra/Graph/provider systems by default

Rejected. It would make reset and CI nondeterministic, require external secrets, and confuse Demo evidence with real-provider acceptance.

### Copy Production business rules into Demo-specific services

Rejected. Demo differences belong at adapter/composition boundaries. Duplicated lifecycle, authorization, Request, entitlement, retry or audit rules would recreate the architectural debt this milestone removes.

## Revisit triggers

A new decision is required before:

- changing the Demo persistence technology away from PostgreSQL;
- combining customer and Platform Demo processes or sessions;
- permitting the Demo to call real identity/provider systems by default;
- sharing any Demo credential, database, secret, audit key or customer data with Pilot/Production;
- exposing reset/seed behavior to Production composition;
- introducing a second mutable Demo Tenant model or synchronization layer;
- treating Demo identity, DAST or provider simulation as Production acceptance evidence.

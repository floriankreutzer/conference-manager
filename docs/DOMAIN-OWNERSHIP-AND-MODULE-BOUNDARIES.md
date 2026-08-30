# Domain Ownership and Module Boundaries

## Status and authority

Accepted for **SaaS 3.5 — Architecture Consolidation & Shared Demo Runtime**.

- Roadmap: [#149](https://github.com/floriankreutzer/conference-manager/issues/149)
- Architecture audit: [#150](https://github.com/floriankreutzer/conference-manager/issues/150)
- Decision date: 2026-08-30
- Roadmap baseline: approved roadmap version 10, 2026-08-30

Root `AGENTS.md`, `docs/CODING-STANDARDS.md`, `docs/ARCHITECTURE.md`, the accepted topology decisions, and the security documentation remain authoritative. This document records the canonical owner of each material product responsibility across `conference-manager`, `conference-manager-api`, and `conference-manager-website`. It does not create a generic service layer or authorize cross-boundary imports.

The ownership rows describe the SaaS 3.5 target baseline implemented by this change. Merge, database/runtime integration and final release conformance remain subject to issues #152, #153 and #155; unmerged code is not delivery evidence.

## Ownership rules

1. A business rule has one canonical owner. Another runtime may present the result or adapt a provider, but it must not implement a conflicting rule.
2. The browser is an untrusted presentation and request-intent tier. Production and the shared Demo obtain effective identity, authorization, Tenant, workflow, price, entitlement, readiness, provider, and audit authority from the appropriate server process.
3. Customer and Platform security domains stay separate. Sharing a PostgreSQL database does not permit shared sessions, Principals, cookies, CSRF keys, API routes, runtime credentials, or browser authority.
4. Frontend capability internals remain private. External consumers use the capability `index.js` contract or an injected port.
5. Backend dependency direction remains HTTP -> application/use case -> domain/policy -> port -> infrastructure adapter. HTTP does not import PostgreSQL/provider implementations, and application/domain code does not import HTTP.
6. `src/shared` and `src/core` contain only stable cross-capability or capability-independent contracts. Neither is a destination for feature-specific business logic.
7. Demo-specific behavior belongs to composition, deterministic identity/provider adapters, seed/reset orchestration, and presentation. Production domain/application rules are reused; they are not forked.
8. `conference-manager-website` remains a public marketing/product-information site. It owns no application session, Tenant, User, Request, integration, Platform, or Demo business authority.

## Canonical ownership matrix

| Material responsibility | Canonical business owner | Presentation or infrastructure adapters | Boundary invariant |
| --- | --- | --- | --- |
| Tenant identity, lifecycle, onboarding and activation | `conference-manager-api/src/tenancy/` and the bounded onboarding/Pilot application services | Customer and Platform HTTP adapters; Tenant Admin and Platform Operator presentation | Tenant identity is internal and server-derived. Lifecycle and activation use one policy/readiness path; Platform recovery must delegate rather than update lifecycle state directly. |
| Customer User, Principal, role and permission authority | `conference-manager-api/src/identity/`, `src/authorization/`, and bounded Tenant User application services | Customer session/API adapters; frontend `src/platform/production-session.js` and Tenant Admin Users section | Browser roles, User IDs, Tenant IDs and permissions are presentation input only. Tenant roles never create Platform authority. |
| Platform Operator identity, Principal, target scope and session | `conference-manager-api/src/platform/identity/` | Platform HTTP/session composition and frontend `src/platform-admin/production/`; Demo uses a separate server-issued Demo Platform session | Customer sessions and claims cannot resolve a Platform Principal. Persona selection cannot mint effective permission in the browser. |
| Request, booking workflow, history and confirmed-change semantics | `conference-manager-api/src/domain/request*.js`, booking-change domain, and bounded Request/booking application services | Employee and Conference Manager frontend applications; customer HTTP/repository adapters; provider adapters behind the calendar port | Server owns workflow, ownership, version, price/configuration snapshots, availability and final transitions. Browser validation is advisory. |
| Site, Room and authoritative time-zone configuration | `conference-manager-api/src/domain/tenant-locations.js` and the Tenant Location application/repository owner | Tenant Admin Locations section; Employee/Manager read projections; Microsoft room mapping adapter | Conference Manager legacy master-data UI is not a second settings authority. Room/provider mapping remains separate from the canonical Site/Room model. |
| Service, equipment and catering catalogue configuration | `conference-manager-api/src/domain/tenant-catalogue.js` and the bounded Catalogue application/repository owner | Tenant Admin Catalogue section; Employee/Manager read projections | There is no generic settings document and no Manager-owned duplicate write path. SaaS 4 provider work adapts this owner rather than replacing it. |
| Cost allocation and cost-center configuration | `conference-manager-api/src/domain/tenant-cost-allocation.js` and its application/repository owner | Tenant Admin Cost Allocation section; immutable Request composition snapshot | Browser totals may guide the User, but authoritative validation and snapshots are server-owned. |
| Booking policy configuration | `conference-manager-api/src/domain/tenant-booking-policies.js` and its application/repository owner | Tenant Admin Booking Policies section; Request composition use case | Policy evaluation is provider-neutral and is not copied into Employee, Manager or provider callbacks. |
| Organization and Tenant presentation configuration | `conference-manager-api/src/domain/tenant-organization.js` and bounded organization/presentation services | Tenant Admin Organization section; frontend Tenant presentation runtime | The browser consumes a minimized server projection and cannot accept remote styling or become settings authority. |
| Microsoft identity and Microsoft 365 connection lifecycle | `conference-manager-api/src/identity/` and bounded Microsoft 365 connection application service | Microsoft Entra/Graph infrastructure adapters; Tenant Admin Microsoft 365 section | Provider claims and payloads are translated at the adapter boundary. Platform fleet health reads projections and does not call Graph per Tenant. |
| Provider-neutral calendar/integration contract | `conference-manager-api/src/integrations/calendar-contract.js` plus the booking integration application services | Microsoft 365 and deterministic Demo provider adapters | Providers implement the existing port. They cannot redefine Employee/Manager workflow, authorization, Tenant ownership, retry safety or audit semantics. |
| Tenant audit taxonomy, integrity and Tenant-visible query | `conference-manager-api/src/audit/` and Tenant audit PostgreSQL repository | Tenant Admin Audit section; approved application services append evidence | Actor, Tenant, time and outcome are server-derived. Tenant audit never exposes Platform audit authority. |
| Platform audit taxonomy, integrity and privileged query | `conference-manager-api/src/platform/audit/` and Platform audit PostgreSQL repository | Platform API and Platform Operator audit presentation | Separate policy, schema, key, query and retention domain. Required audit failure rolls back privileged mutations. |
| Entitlement, capability dependency and quota semantics | `conference-manager-api/src/entitlements/`, `src/domain/capability-dependency-policy.js`, and Platform entitlement application services | Customer effective-capability projection; Platform Operator entitlement/metering presentation | Package/presentation state is not authorization. Direct and package changes use one canonical capability registry and atomic transaction path. |
| Readiness and privacy-minimized Platform projections | Canonical backend readiness policy plus the shared readiness evaluator and bounded projection repositories | Platform API and Platform Operator fleet sections | Fleet display and activation commit-time checks consume the same required checks and freshness semantics; browser fixture flags are not authority. |
| Employee application presentation and use-case intent | `conference-manager/src/employee/`, exposed only through `src/employee/index.js` | Customer composition root injects the server-backed repository/session port | Employee does not import Manager internals and does not own server workflow, price, Tenant or provider authority. |
| Conference Manager presentation and use-case intent | `conference-manager/src/manager/`, exposed only through `src/manager/index.js` | Customer composition root injects the server-backed repository/session port | Manager does not import Employee internals except through a deliberate public contract and does not own Tenant settings writes. |
| Tenant Admin presentation and section orchestration | `conference-manager/src/tenant-admin/`, exposed only through `src/tenant-admin/index.js` | Section adapters are injected by the customer composition root | Sections do not import one another or Platform/Employee/Manager internals. Visibility is not authorization. |
| Customer application composition and runtime integration | `conference-manager/src/app.js` with bounded customer `src/platform/` infrastructure contracts | Customer HTML entry point | `src/app.js` is the only customer composition root. Side-effect bootstrap modules must be composed deliberately and must not become parallel roots. |
| Platform Operator browser presentation | `conference-manager/src/platform-admin/` with separate Production and Demo composition roots | `platform-admin/index.html` and `platform-admin-demo/index.html` | No customer capability/session imports, no Production-to-Demo fallback, and no browser-owned Platform mutation or permission authority. |
| Shared frontend presentation contracts | `conference-manager/src/shared/` | Employee, Manager and customer composition may consume deliberate stable contracts | Shared owns no capability lifecycle, persistence authority, settings domain or alternate localization runtime. |
| Frontend capability-independent primitives | `conference-manager/src/core/` | All frontend artifacts may consume reviewed stable contracts | Core owns canonical localization, safe UI and defensive API primitives; it owns no Employee, Manager, Tenant Admin or Platform business policy. |
| Customer HTTP composition | `conference-manager-api/src/app.js` and `src/index.js` | Customer route modules and PostgreSQL/provider adapters | Customer composition never registers Platform routes or loads Platform identity/session/audit secrets. |
| Platform HTTP composition | `conference-manager-api/src/platform/app.js`, `src/platform-composition.js` and `src/platform-main.js` | Platform route modules and bounded Platform persistence adapters | Platform composition never registers customer routes or resolves customer Principals/sessions. |
| PostgreSQL schema, transaction and migration mechanism | `conference-manager-api/migrations/`, migration scripts, and bounded repositories under `src/persistence/postgres/` | Customer and Platform runtime roles use least-privilege adapters | SQL stays in persistence. Demo uses the same migration model in an isolated database; application runtimes never auto-downgrade or auto-select Demo. |
| Shared server-backed Demo runtime | Demo-only backend composition, seed/reset orchestration and deterministic identity/provider adapters defined by ADR-010 | Customer Demo and Platform Demo browsers call their separate Demo API/session boundaries | One isolated PostgreSQL data model, not two synchronized fixture documents. Browser storage may hold non-authoritative UX preferences only. |
| Public marketing and product website | `conference-manager-website` | Static/public publishing stack | No SaaS domain, application session, privileged API, Demo reset or customer data authority may be added. |

## Allowed dependency direction

### Customer frontend

```text
index.html -> src/app.js
  -> customer Platform infrastructure contracts
  -> Employee / Manager / Tenant Admin public APIs
     -> capability-private application and presentation
        -> stable Shared presentation and Core primitives
```

The customer Platform layer may adapt runtime/session/API concerns but does not own capability business rules. Employee, Manager and Tenant Admin must not reach through one another's private modules.

### Platform Operator frontend

```text
platform-admin entry point
  -> Production or Demo composition root
     -> shared Platform Admin application/contracts
        -> canonical Core localization and safe presentation primitives
```

The Production and Demo composition roots are mutually exclusive. Shared Platform Admin code does not select an adapter, and neither graph imports customer capability or customer session authority.

### Backend

```text
customer HTTP root OR Platform HTTP root
  -> bounded application/use-case service
     -> canonical domain and authorization policy
        -> explicit repository / identity / integration port
           -> PostgreSQL or provider adapter
```

The two process roots may reuse principal-neutral transport primitives and canonical domain/application services. They do not reuse Principals, sessions, CSRF keys, route registries or runtime configuration namespaces.

## Confirmed consolidation findings and disposition

| Finding on the SaaS 3 baseline | Canonical disposition | Verification owner |
| --- | --- | --- |
| `index.html` started customer identity, Demo security, requester attribution, application and parity scheduling as separate side-effect roots. | `src/platform/demo-bootstrap.js` and `production-bootstrap.js` are mutually exclusive Customer roots and inject the established session/API boundary into `src/app.js`; do not add independent application roots. | #150 / #153 architecture and E2E gates |
| Conference Manager has legacy master-data administration while SaaS 2 gives Tenant Admin canonical Organization, Locations/Rooms, Catalogue, Booking Policy and Cost Allocation ownership. | Remove or convert the legacy Manager mutation path to a read/use-case projection. Tenant Admin plus backend settings owners remain authoritative. | #150 regression and role-boundary tests |
| `src/shared/parity-data.js` combines browser persistence, seed migration and cross-capability presentation concerns. | Move persistence/session authority to the shared Demo server and move domain-specific behavior to its canonical capability. Retain in Shared only stable presentation contracts that still have genuine cross-capability meaning. | #150 / #153 architecture and persistence gates |
| Customer Demo state was authoritative in browser storage. | The active Customer Demo uses its server session/API and the shared Demo PostgreSQL runtime. Local language, bounded draft or navigation convenience state cannot establish business authority. | #152 / #153 / #154 |
| Platform Admin Demo used `createPlatformAdminDemoStore()`, `platform_admin_demo_v1`, browser persona state and browser mutation rules. | The active Platform Demo uses `operator-session.js` and `platform-api.js`; the retired store/fixture/mutation modules are absent from its runtime graph. API failure renders unavailable. | #152 / #153 / #155 |
| Several frontend files are name/path compatibility facades around canonical contracts. | Retain only the bridges in the register below until their named consumers migrate; no new consumers are permitted. Remove each bridge and its gate exception immediately when its trigger is met. | #150 and the consuming capability owner |
| The backend legacy Tenant operator CLI remains an active adapter alongside the grant-bound Platform recovery path. | The grant-bound Platform fallback and HTTP adapters call the canonical Platform application services. The legacy trusted-marker path is not authorization and must not remain an active privileged mutation path. | #150 backend architecture/security tests |
| Platform recovery persistence can bypass canonical Tenant lifecycle/session consequences, and readiness projection can drift from activation checks. | Recovery delegates to the canonical lifecycle transaction and session-revision behavior. Fleet display and activation use one readiness evaluator and required-check policy. | #150 backend unit, PostgreSQL and negative tests |
| The public website contains only marketing/presentation code. | Keep it separate and authority-free. No migration is required. | #151 topology review |

## Compatibility bridge register

These bridges own no independent business data or rule. A retained bridge is an explicitly time-bounded migration tool, not an alternative public API.

| Bridge | Owner | Current reason | Removal trigger | New consumers |
| --- | --- | --- | --- | --- |
| `src/manager/parity-i18n.js` | Manager | `manager-parity.js` and `admin-parity.js` still call the historical `pt()` name while Core owns all messages and resolution. | Both consumers import/use `t()` from `src/core/i18n.js`; update the localization inventory/gate in the same change. | Prohibited |
| `src/employee/employee-ux-i18n.js` | Employee | `employee-ux.js` still calls the historical `uxText()` name; the adapter delegates only to Core. | The consumer calls canonical Core `t()` directly and its DE/EN regression coverage passes. | Prohibited |
| `src/manager/employee-visuals.js` | Manager | One Manager first-use module reaches the Employee request-card identity helper through an explicit Employee public contract. | Inject the required stable request-card identity contract or consume the Employee public export directly without a Manager-local alias. | Prohibited |
| `src/employee/parity-data.js` | Employee | Capability-local import-path compatibility for consumers of the current Shared parity-data aggregator. | Demo persistence migration gives Employee an owned server-backed port and remaining stable presentation helpers have their final owner. | Prohibited |
| `src/manager/parity-data.js` | Manager | Capability-local import-path compatibility for consumers of the current Shared parity-data aggregator. | Demo persistence migration gives Manager an owned server-backed port and remaining stable presentation helpers have their final owner. | Prohibited |
| `src/tenant-admin/demo-onboarding.js` | Tenant Admin | Preserves the established Demo onboarding factory name while Microsoft operations use the consolidated port. | All public/test consumers use the consolidated operations contract or the bridge is replaced by the server-backed Demo adapter in #153. | Prohibited |
| `src/tenant-admin/demo-user-administration.js` | Tenant Admin | Preserves the established Demo User administration factory name while User lifecycle/role operations share one port. | All consumers use the consolidated User operations contract or the bridge is replaced by the server-backed Demo adapter in #153. | Prohibited |
| `src/platform/tenant-user-administration-api.js` | Customer Platform integration | Preserves the established Composition Root import while `tenant-user-operations-api.js` owns role and lifecycle API behavior. | Composition, tests and architecture gates use the canonical operations facade. | Prohibited |

If implementation removes a bridge before this document is merged, the same change must delete its row rather than documenting a nonexistent compatibility path.

## Completed Demo migration inventory

The following rows record the replacement of the SaaS 3 browser-owned authorities. They are an audit trail, not permission to restore the retired paths.

| Superseded browser-owned area | Active destination |
| --- | --- |
| Customer profile, Tenant/persona, catalog, Site/Room, Request, notification and draft repository state reached through `src/platform/application-context.js`, `src/core/storage.js` and `src/shared/parity-data.js` | Customer Demo session/API plus canonical customer application endpoints and the shared Demo PostgreSQL database. Only explicitly non-authoritative language, navigation and bounded draft convenience state may remain local. |
| Tenant Admin in-memory Demo settings/User/Microsoft/audit/capability adapters and fixtures | Server-backed Customer Demo APIs using canonical Tenant settings, User, integration and audit application owners. |
| `src/platform-admin/demo/demo-store.js`, `demo-adapter.js`, `fixtures.js`, `operator-fixtures.js` and their bootstrap imports | Demo Platform session/API adapter backed by canonical Platform application services and the shared Demo database. |
| Browser-selected Platform role/persona and effective permission snapshot | Bounded persona request to the Demo Platform session boundary; the server resolves and returns effective authority. |
| Browser-executed Platform lifecycle, invitation, entitlement, quota and recovery mutations | Existing canonical Platform application services and audit-atomic PostgreSQL transactions behind the Demo Platform HTTP boundary. |

## Automated enforcement expectations

`npm run check:architecture` in both application repositories enforces the static shared-Demo boundaries. The gates reject at least:

- customer or Platform Production imports/reachability into Demo composition, seeds, reset, identity or provider simulation;
- Platform Operator imports of customer capability/session internals;
- customer imports of Platform Operator authority;
- browser storage access for Customer or Platform Demo business, Tenant, Request, fleet, persona or permission authority;
- Demo API outage fallback to LocalStorage, fixtures or browser mutation rules;
- direct HTTP imports of PostgreSQL/provider implementations;
- Platform recovery bypass of canonical lifecycle/readiness/session consequences;
- cross-capability private imports, unresolved dependencies, cycles and parallel localization/API mechanisms;
- a Production artifact manifest containing Demo-only files or one Production origin serving customer and Platform entry points.

Runtime and PostgreSQL tests remain necessary because static imports cannot prove authorization, Tenant scoping, reset concurrency, audit atomicity or cross-browser shared-state propagation.

## Change and review rule

Any new material responsibility must update this matrix in the same reviewed change that introduces the owner. A change that creates a second active owner, retains a bridge past its removal trigger, or adds an undocumented exception fails architecture review. File size, directory symmetry or repository count alone is never sufficient reason to move ownership.

# Conference Manager Architecture

## Governance authority and baseline lifecycle

Root `AGENTS.md` is the canonical repository instruction entry point. Its permanent modular-architecture rules are normative for humans, Codex, all other AI agents and subagents. `docs/CODING-STANDARDS.md` remains the mandatory detailed engineering standard. This document describes the current runtime architecture and automated enforcement; it does not create a competing rule set.

The repository is a build-free native ES-module application. The current `main` branch is the functional and architectural baseline. After a scoped change is implemented, regression/security/architecture validated, reviewed and merged, the resulting `main` becomes the next baseline. Historical commits may be referenced for audit or migration history only and must not become permanent development baselines.

Architectural changes must preserve observable behavior, persisted data, DOM/test contracts, localization, accessibility behavior and security boundaries unless an explicit approved requirement changes them.

The runtime dependency direction is:

```text
Browser / index.html
  -> Customer Production or Demo bootstrap
  -> src/app.js composition
     -> Platform application shell/context
     -> Employee public module API
     -> Manager public module API
     -> Tenant Admin public module API
        -> shared cross-capability presentation/contracts
           -> core domain and infrastructure primitives
```

`src/core` must not depend on Employee or Manager modules. `src/shared` must not depend on Employee or Manager modules. Employee modules must not depend on Manager modules. Consumers outside Employee or Manager must use the respective `index.js` public API rather than private implementation files.

## Ownership and architecture decisions

The cross-repository canonical ownership matrix, dependency rules, consolidation findings, compatibility-bridge register and Demo migration inventory are maintained in `docs/DOMAIN-OWNERSHIP-AND-MODULE-BOUNDARIES.md`.

Accepted topology decisions are cumulative:

- `docs/SAAS-PRODUCTION-TOPOLOGY.md` owns the dedicated backend and customer same-origin boundary;
- `docs/SAAS3-PLATFORM-CONTROL-PLANE.md` owns the separate Platform Operator artifact/process/session/audit boundary;
- `docs/ADR-009-PLATFORM-OPERATIONS-REPOSITORY-TOPOLOGY.md` revalidates **KEEP** for Platform frontend and backend source ownership while retaining separate deployable artifacts and processes;
- `docs/ADR-010-SHARED-SERVER-BACKED-DEMO-RUNTIME.md` owns the isolated PostgreSQL-backed shared Demo topology, separate Customer/Platform Demo sessions and deterministic reset/seed requirements.

The accepted decisions define boundaries and implementation constraints. A decision document does not by itself prove that its runtime, deployment or governance work has been completed; the owning milestone issue and merged executable evidence remain required.

## Runtime structure

```text
src/
├── app.js                         # composition/bootstrap only
├── core/
│   ├── api-client.js
│   ├── catalog.js
│   ├── domain.js
│   ├── i18n.js                    # public canonical localization contract
│   ├── i18n-base.js               # baseline catalog/runtime implementation
│   ├── i18n-capability-messages.js# consolidated capability messages
│   ├── security-i18n.js
│   ├── security-policy.js
│   ├── preferences.js             # bounded non-authoritative preferences only
│   ├── storage.js
│   └── ui.js
├── employee/
│   ├── index.js                   # public Employee API
│   ├── application.js             # Employee UI/use-case orchestration
│   ├── request-session.js         # request-session model/mapping rules
│   ├── request-lifecycle.js       # submit/resubmit/cancel/filter rules
│   └── Employee experience enhancements
├── manager/
│   ├── index.js                   # public Manager API
│   ├── application.js             # Manager UI/use-case orchestration
│   ├── booking-lifecycle.js       # confirm/change/reject rules
│   ├── reporting.js               # reporting domain calculations
│   ├── parity-i18n.js             # temporary Manager-only Core delegation bridge
│   └── Manager experience enhancements
├── tenant-admin/
│   ├── index.js                   # public Tenant Admin API
│   ├── application.js             # settings-shell composition/orchestration
│   ├── settings-shell.js          # authorized settings navigation/focus/error orchestration
│   ├── section-registry.js        # bounded section registration/visibility
│   ├── section-contract.js        # section contract validation
│   ├── section-presentation.js    # shared Tenant Admin section presentation
│   ├── route.js                   # bounded Tenant Admin hash route helpers
│   ├── server.js                  # server-backed Customer runtime facade
│   ├── demo-onboarding.js         # retired compatibility file; not in active roots
│   ├── demo-user-administration.js# retired compatibility file; not in active roots
│   ├── onboarding-error.js
│   ├── onboarding-wizard.js       # existing Microsoft 365 onboarding presentation
│   ├── user-role-model.js         # testable elevated-role selection rules
│   └── sections/
│       ├── organization/index.js
│       ├── locations/index.js
│       ├── catalog/index.js
│       ├── booking-policies/index.js
│       ├── cost-allocation/index.js
│       ├── users/index.js
│       ├── microsoft365/index.js
│       ├── capabilities/index.js
│       └── audit/index.js
├── platform/
│   ├── app-shell.js               # shell/navigation/profile/help routing
│   ├── application-context.js     # validated session and injected repository context
│   ├── demo-bootstrap.js          # Customer Demo-only composition root
│   ├── demo-session.js            # Customer Demo session/context API boundary
│   ├── production-session.js      # validated production session/CSRF runtime
│   ├── production-bootstrap.js    # Customer Production-only composition root
│   ├── tenant-admin-operations-api.js # public Tenant operations adapter facade
│   ├── tenant-settings-api.js     # public Tenant settings adapter facade
│   ├── server-tenant-settings-api.js # shared server-backed settings facade
│   ├── tenant-presentation-api.js # minimized effective Tenant presentation projection
│   ├── tenant-presentation-runtime.js # in-memory revision/localization/shell integration
│   ├── tenant-user-administration-api.js # Tenant-scoped role API adapter
│   ├── demo-security.js
│   ├── feature-flags.js
│   ├── feature-parity.js
│   └── requester-attribution.js
├── platform-admin/
│   ├── application.js             # shared operator presentation only
│   ├── platform-api.js            # validated Platform HTTP adapter
│   ├── production/bootstrap.js    # Platform Production-only composition root
│   └── demo/
│       ├── bootstrap.js           # Platform Demo-only composition root
│       └── operator-session.js    # server-issued Demo persona/reset boundary
└── shared/
    ├── application-presentation.js
    ├── booking-change-loader.js       # bounded cross-capability proposal lookup contract
    ├── notifications.js
    ├── request-card.js
    └── parity-data.js
```

The former flat `src/features` directory is not part of the modular architecture. The architecture quality gate rejects its reintroduction.

## Responsibilities

### `src/app.js`

`src/app.js` is the application Composition Root. It owns only responsibilities required for:

- application bootstrap;
- top-level dependency composition;
- Employee, Manager and Tenant Admin capability initialization through their public APIs;
- injection of the already selected Production or Demo server/session adapters;
- application-shell initialization;
- global application event registration;
- top-level orchestration between explicit contracts;
- the established application build marker.

Business rules, validation, request/Manager lifecycle logic, persistence implementation, data transformation, calculations, reporting, feature-specific rendering, capability-specific event handlers, reusable presentation components and direct capability internals do not belong in `src/app.js`.

If logic begins growing in the Composition Root, move it to the owning capability or Platform concern rather than allowing `src/app.js` to become a monolithic implementation again.

### `src/core`

Core contains stable domain and infrastructure primitives:

- `domain.js`: scheduling/conflict validation, participant totals, cost calculation, repeat/history logic and status constants;
- `catalog.js`: catalog/site defaults and loading/localization helpers;
- `storage.js`: defensive browser persistence and named repository APIs;
- `i18n.js`: the only public application localization contract. It owns key resolution and exposes `t()`, `tFor()`, language/locale state and locale-aware formatting contracts;
- `i18n-base.js`: the pre-existing synchronized DE/EN baseline catalog and locale runtime, retained inside Core so its established storage, fallback, event and `Intl` semantics remain unchanged;
- `i18n-capability-messages.js`: the synchronized DE/EN capability messages migrated from the former parity catalog under semantic canonical namespaces;
- `security-i18n.js`: security-notice translations;
- `security-policy.js`: runtime/role/language policy normalization;
- `api-client.js`: defensive same-origin production API contract;
- `ui.js`: reusable safe DOM/accessibility primitives.

Core remains capability-independent. Feature-specific business logic and capability rendering do not belong in Core. New UI copy must use the canonical Core localization contract; new parallel translation catalogs or capability-owned fallback engines are prohibited.

### `src/employee`

Employee owns the complete baseline Employee application behavior behind `src/employee/index.js`.

`application.js` owns the six-step request UI and Employee use-case orchestration, including draft save/restore, room/service/catering/cost/review rendering, submit/resubmit, request list/calendar, details, cancellation, repeat/change editing, guest information and print behavior.

Business/session rules that can be tested without the DOM are separated into:

- `request-session.js`: request editing state, room-availability model, cost composition, draft payload/restore and repeat/change mapping;
- `request-lifecycle.js`: final validation, submit/resubmit/cancel transitions and Employee request filtering.

Existing Employee parity/UX/accessibility modules remain within the Employee boundary and continue to be exposed through the same public facade. Employee localization consumers use the canonical Core localization contract directly; the former Employee parity-i18n bridge has been retired.

Employee internals are private. External code must not expose or import internal Employee modules merely for convenience; public API additions require a legitimate cross-module contract.

### `src/manager`

Manager owns the complete baseline Conference Manager application behavior behind `src/manager/index.js`.

`application.js` owns Booking Cockpit filtering/actions, room planning, baseline reporting presentation and administration rendering/persistence orchestration.

`booking-lifecycle.js` owns testable confirm/change/reject status and calendar transitions. `reporting.js` remains the testable Manager reporting calculation model used by the enhanced reporting experience.

`parity-i18n.js` is a temporary Manager-only compatibility bridge for two baseline enhancement modules that still call the historical `pt()` function name. It owns no messages, fallback behavior, storage or interpolation logic and delegates directly to `src/core/i18n.js`. It must not receive new consumers or translation content and should be removed when those remaining call sites are migrated in a separately regression-protected cleanup.

Manager internals are private. Manager-to-Employee collaboration is permitted only through an explicit approved Employee public contract and must never reach into Employee implementation details.

### `src/tenant-admin`

Tenant Admin owns the Tenant self-service settings capability behind `src/tenant-admin/index.js`. The SaaS 2 implementation is a bounded settings shell rather than a combined User/Microsoft administration surface. Detailed permanent section-boundary rules are documented in `docs/SAAS2-MODULAR-BOUNDARIES.md`.

`application.js` composes the Tenant Admin section registry and settings shell. The registry owns section registration and authorized visibility; the shell owns navigation, shared headings, explicit-navigation focus, and the fallback for an unexpectedly rejected section render. Each section owns its normal loading, empty, and error presentation and orchestration. The shell and registry must not contain organization, catalogue, booking-policy, cost-allocation, Microsoft lifecycle, audit or User lifecycle business decisions.

Each settings domain is owned below `src/tenant-admin/sections/<section-id>/` and exposes its section through that directory's `index.js`. Section internals must not import one another. Cross-section collaboration must use explicit injected contracts rather than private implementation access.

The `users` section preserves the existing Tenant-scoped User/elevated-role administration capability. `user-role-model.js` remains the independently testable elevated-role selection model. Production and Demo reads/writes use the injected server-backed Tenant User API adapter. Historical in-memory Demo adapters are not active business authorities and must never be reintroduced into either runtime graph.

The `microsoft365` section preserves the existing Microsoft 365 onboarding and connection behavior. `onboarding-wizard.js`, the onboarding error model and the onboarding runtime selected through the public Tenant Admin API remain the owned implementation; the section composes those existing contracts rather than duplicating lifecycle operations.

The owning Customer bootstrap establishes either a Production or Customer Demo server session before `src/app.js` composes the corresponding server-backed section adapters. Authorization remains authoritative in the trusted backend/session path; section visibility is presentation behavior only. A failed or unauthorized API path must never select fixtures, browser mutation code or browser-stored Tenant authority.

Tenant Admin uses bounded hash routes in the form `#tenant-admin/<section>`. Authorized routes may restore the selected Tenant Admin section on reload. When the final resolved top-level view changes away from Tenant Admin, the Tenant Admin hash is removed so a later reload does not reopen a view the user already left. The application shell exposes only a generic view-change callback; `src/app.js` composes Tenant Admin route cleanup through the public Tenant Admin route helper. Platform does not import Tenant Admin internals.

Explicit Tenant Admin section navigation moves focus to the target section heading. A successful Users role save explicitly restores focus to the updated User card after rerender. Other section-internal rerenders have no repository-wide focus-restoration guarantee unless the owning section implements and regression-protects that behavior.

The Production Tenant Admin capability is composed only when the validated server session grants the `tenant_admin` role and the capability-wide `tenant:users:manage` permission; an individual section is then exposed only when the same trusted session also grants that section's registered permission. Tenant Admin capability does not imply Conference Manager capability or Platform Operator authority. Tenant selectors, Platform Admin and arbitrary role values remain outside the browser contract.

### `src/platform`

Platform contains application-wide composition and infrastructure-facing concerns rather than Employee/Manager business logic.

- `application-context.js` owns access to the validated server session, injected profile/catalog/site/Request repositories and the bounded Demo context-switch contract.
- `demo-bootstrap.js` and `demo-session.js` own Customer Demo bootstrap, same-origin `/api/v1/demo/*` session/context calls and strict reuse of the Production session projection validator. Persona or Tenant choices are browser request input only; the server returns effective authority.
- `production-bootstrap.js` owns the mutually exclusive Customer Production bootstrap.
- `app-shell.js` owns shell navigation, welcome view, profile/help dialogs and top-level view orchestration. It receives Employee/Manager/Tenant Admin application contracts from `src/app.js` rather than importing capability internals. Its optional view-change callback is generic and must not encode Tenant Admin routing rules.
- `production-session.js` owns the bounded, fail-closed production session bootstrap and in-memory CSRF runtime.
- `tenant-admin-operations-api.js` is the explicit Composition Root facade for the Tenant audit-history and effective-capability Production adapters. User lifecycle operations remain behind the established Tenant User facade, while Microsoft operations decorate the existing Microsoft 365 connection port.
- `tenant-settings-api.js` is the explicit Composition Root facade for the bounded Organization, Location, Catalogue, Booking Policy and Cost Allocation Production adapters. The domain adapters retain their individual response-validation and wire-contract ownership behind that facade.
- `tenant-presentation-api.js` owns the exact minimized presentation projection used by every authenticated Tenant role. `tenant-presentation-runtime.js` owns only its fail-safe in-memory revision lifecycle, Core localization configuration, reviewed same-origin mark rendering, and Organization-save refresh integration. Neither accepts remote assets, custom styles, Demo fallback, or browser-side authority. The complete contract is documented in `docs/SAAS2-TENANT-PRESENTATION.md`.
- `tenant-user-administration-api.js` owns validated, cursor-paginated Tenant User reads and allowlisted elevated-role writes through the shared same-origin API client.
- Demo-security disclosure, requester attribution, feature flags and the post-render parity scheduler remain Platform responsibilities.

`feature-parity.js` remains the single coalesced enhancement scheduler. Manager enhancement modules must not add their own global synchronization loops. Platform localization consumers use the canonical Core localization contract directly.

Platform must not become a replacement monolith for logic moved out of `src/app.js`. Capability business rules and capability-specific rendering stay with the owning capability.

### `src/shared`

Shared contains code genuinely reused across capabilities with stable cross-capability meaning and must not depend back on Employee or Manager.

- `request-card.js` owns the common request-card/timeline DOM contract and receives capability-specific actions as callbacks.
- `application-presentation.js` owns the small cross-capability form/section/KPI presentation primitives extracted from the former composition root.
- `booking-change-loader.js` owns the bounded, failure-isolated proposal lookup contract used by the Employee and Manager production capabilities. Its explicit Shared ownership prevents feature workflow orchestration from leaking into capability-independent Core.
- `notifications.js` owns the common notification persistence/presentation contract.
- `parity-data.js` centralizes the existing enhanced catalog/site/request presentation data helpers and uses the canonical Core localization contract where localized defaults are required.

The former Shared parity translation catalog and bridge have been retired. Shared must not become a second localization owner.

Do not move code into Shared merely because two files currently use it. Keep code in its owning capability until there is a real stable reuse requirement. Do not create generic `utils`, `helpers`, `misc`, `common` or equivalent dumping grounds.

## Public module contracts

Public module APIs are explicit:

- Employee: `src/employee/index.js`, including `createEmployeeApplication` plus the existing Employee enhancement exports.
- Manager: `src/manager/index.js`, including `createManagerApplication` plus the existing Manager enhancement exports.
- Tenant Admin: `src/tenant-admin/index.js`, exposing `createTenantAdminApplication`, the server-backed `createTenantAdminOnboardingRuntime`, and the bounded route helpers `clearTenantAdminRoute`, `isTenantAdminRoute`, `tenantAdminHashForSection` and `tenantAdminSectionFromHash`.

The application factories return capability contracts consumed by Platform composition:

- Employee runtime contract: request rendering, request-list rendering, draft restore/query/save behavior.
- Manager runtime contract: Manager application rendering.
- Tenant Admin runtime contract: modular settings-shell rendering through injected section adapters; Microsoft onboarding/runtime and route helpers remain explicit public contracts rather than Platform-owned behavior.

Cross-capability rendering is handled by Shared presentation contracts. A consumer outside a capability must not import a private capability implementation file.

## Separation of domain, application and UI concerns

The repository remains intentionally lightweight; no artificial service/interface hierarchy is introduced. The practical direction is:

```text
Composition
  -> capability UI / application/use-case orchestration
     -> testable lifecycle/session/domain rules
        -> approved Core / Platform infrastructure contracts
```

`request-session.js`, `request-lifecycle.js`, `booking-lifecycle.js`, `reporting.js` and Tenant Admin's independently testable role/route rules must remain independent of unrelated browser rendering responsibilities. Rendering/application modules may consume those rules, not the reverse.

Significant business rules should be independently testable where practical and must not be buried unnecessarily inside DOM event callbacks, large rendering functions, browser-storage handlers or the Composition Root.

## Feature flags

`src/platform/feature-flags.js` is the centralized feature-flag foundation for genuinely new optional functionality.

1. Existing baseline behavior is not represented in the feature-flag registry merely because it is moved or refactored.
2. A genuinely new optional feature must be evaluated for feature-flag use and receives a stable centrally registered identifier when controlled rollout/rollback is appropriate.
3. New flags default to `false` unless explicitly approved otherwise.
4. Unknown, malformed and unregistered flags fail closed to disabled.
5. Runtime overrides may only affect registered identifiers.
6. Flag conditions belong at architectural boundaries, not scattered through unrelated implementation details.
7. Every flagged feature requires OFF and ON tests: OFF preserves baseline; ON verifies the new behavior.
8. Feature flags are not substitutes for module boundaries.
9. Once a feature is permanently released and no controlled rollback need remains, remove the stale flag and dead alternative path in a dedicated cleanup change.

Runtime modules outside `src/platform/feature-flags.js` may consume the exported `featureFlags` runtime contract, but must not import/re-export resolver or definition factories to construct parallel registries. The architecture gate enforces that construction and registration remain centralized.

## Persistence and data compatibility

The active Customer and Platform Demo runtimes use one isolated PostgreSQL database through separate server processes and least-privilege database roles. Customer and Platform sessions, cookies, CSRF state, audit domains, API namespaces and origins remain separate. A shared database is not a shared authorization boundary.

`src/core/preferences.js` owns the bounded browser-local language preference. An explicitly reviewed navigation marker or unsaved draft may remain local only when it cannot establish identity, Tenant, permission, workflow, price, entitlement, provider, audit or other business authority. `src/core/storage.js` contains historical/static-MVP persistence contracts but is unreachable as authoritative persistence from the active Demo and Production roots.

Capability runtimes must not invent direct browser-storage conventions. New storage keys, serialization formats, restore/cache behavior or persistence abstractions require explicit architectural justification.

One historical compatibility exception is explicitly approved for the existing baseline: `src/manager/admin-parity.js` writes `PARITY_RETURN_KEY` directly to `sessionStorage` immediately before a controlled page reload so the Manager administration view can restore its return position. This is a narrow session-scoped navigation marker, not a general persistence convention. The architecture gate permits only that exact `sessionStorage.setItem(PARITY_RETURN_KEY, ...)` call in that file and rejects any additional direct Employee/Manager browser-storage access. Do not expand this exception; removing it should be a separate regression-protected runtime cleanup routed through an approved contract.

Historical browser data is never silently uploaded into the shared Demo or a Production Tenant. Server/API schema changes and any deliberately retained local preference migration remain explicit and tested. The repository retains compatibility documentation for:

- existing storage key names;
- request/catalog/site/profile/notification/draft object shapes;
- serialization behavior;
- request and calendar status identifiers;
- draft restore behavior;
- existing saved data.

Any required persistence migration must be explicit, tested, documented and backward-safe where practical.

## UI, accessibility and design system

Architectural changes are not implicit redesigns. Preserve established information architecture, terminology, DOM semantics, CSS classes/data attributes/E2E selectors where they are contracts, responsive behavior, keyboard/focus behavior and accessible dialog/form behavior unless an explicit product requirement changes them.

Global design decisions remain exclusively in `assets/tokens.css`. CSS ownership remains defined in `docs/DESIGN-SYSTEM.md`.

Capability-specific UI belongs to its capability. Cross-capability presentation belongs in Shared only when it is genuinely reusable and stable.

User-visible application copy remains governed by the repository i18n rules. New application copy belongs in the canonical Core localization mechanism.

## Canonical localization architecture

Application localization has one translation-ownership path under Core. The former `src/shared/parity-i18n.js` catalog was characterized before migration: 149 synchronized DE/EN legacy keys, 148 active references, one unused candidate, no DE/EN placeholder drift and no same-key conflicts. Of those legacy values, 45 active entries reused exact existing canonical translations, one unused alias was not migrated, and 103 unique active translations were moved into `src/core/i18n-capability-messages.js` under semantic namespaces.

The canonical application catalogs now contain 570 synchronized DE/EN keys. `scripts/check-i18n.mjs` enforces key synchronization, duplicate-definition detection, DE/EN placeholder parity, absence of canonical `parity.*` keys and the rule that any retained compatibility bridge cannot own translations. `tests/localization-inventory.test.js` protects the consolidated end state and representative baseline copy.

`src/core/i18n.js` is the public resolver. Normal UI rendering uses `t()`. `tFor(locale, key)` exists only for the established bilingual master-data initialization path that must materialize both DE and EN values independent of the currently selected UI language. Locale persistence, fallback behavior, language-change events and `Intl` formatting continue to use the preserved baseline Core implementation. A valid explicit User language remains authoritative; when it is absent, the effective Tenant locale is applied without persisting it as a User choice. The effective Tenant ISO currency drives the shared money formatter.

The remaining Manager `parity-i18n.js` file is a name-compatibility adapter only, not a localization catalog or alternative API implementation. New code must import the Core contract directly.

## Incremental architecture changes

Moving files or reducing line counts is not modularization by itself. Responsibility, ownership, public contracts, dependency direction, testability and enforceable boundaries define the architecture.

Future behavior-rich refactoring must remain incremental:

1. understand current behavior and consumers;
2. identify existing regression coverage;
3. add characterization coverage where needed;
4. extract one cohesive responsibility;
5. update consumers through the intended contract;
6. remove obsolete implementation/bridges when migration is complete;
7. run applicable quality, architecture, regression and security gates.

Do not perform big-bang rewrites solely to produce a cleaner directory structure. Do not create artificial micro-modules or arbitrary file-size targets.

Parallel active business implementations are prohibited. Temporary compatibility bridges are allowed only for controlled migration, require a documented reason and must be removed once all consumers have migrated.

## Security boundaries

The active Customer Demo and Platform Demo are explicitly selected, server-backed browser artifacts. Neither modularity nor client-side presentation checks are authorization: Demo and Production authority stays in the appropriate backend process, and the browser must never fall back to storage, fixtures or browser mutation rules. Production authentication/authorization requirements remain defined in `docs/DEMO-SECURITY.md` and `docs/PRODUCTION-SECURITY.md`; the Demo-specific topology is defined by ADR-010.

The accepted SaaS 3 control-plane decision in `docs/SAAS3-PLATFORM-CONTROL-PLANE.md` adds a separately deployable Platform Operator browser artifact and operator origin. It does not change the current customer runtime graph. Existing `src/platform` remains customer application-wide composition; operator presentation belongs to the independent `src/platform-admin` boundary and must not import Employee, Manager, Tenant Admin, customer Platform, or customer session internals. Its Production entry point is `platform-admin/index.html` with `src/platform-admin/production/bootstrap.js`; the isolated Demo entry point is `platform-admin-demo/index.html` with `src/platform-admin/demo/bootstrap.js`.

The Customer and operator artifacts use separate backend processes, sessions, API routing and deployment manifests. Customer `src/app.js` never composes the operator artifact. A failed Customer or Platform session/API renders unavailable and never selects the other trust domain, a Production/Demo alternative, LocalStorage, fixtures or browser mutation logic.

CSP, safe DOM creation, defensive storage, safe URL handling, API restrictions, secret scanning, dependency review and SAST-style checks remain unchanged or stronger.

Architecture changes must not bypass security wrappers, validation, authorization boundaries, dependency controls, secret controls or secure configuration. Automated checks are evidence for the executed controls only and must not be described as complete OWASP compliance.

## Architecture enforcement

`npm run check:architecture` executes the repository architecture gate, `scripts/check-modular-runtime.mjs` and the SaaS 2 boundary enforcement used for the modular Tenant Admin settings architecture.

Together they enforce, among other controls:

- runtime stylesheet/entry-point ownership;
- absence of the former `src/features` directory;
- `src/app.js` Composition Root dependency restrictions;
- Employee and Manager public facades;
- Tenant Admin section identities, section `index.js` entry-point usage and private section boundaries;
- rejection of cross-section Tenant Admin imports and direct Tenant Admin section dependencies on Platform, Employee or Conference Manager internals;
- rejection of Demo imports from Production-named modules covered by the SaaS 2 static boundary policy;
- separate Customer Demo and Platform Demo entry points, sessions and same-origin API namespaces;
- rejection of browser-storage business/persona/permission authority and Demo API fallback;
- public-API-only external capability consumption;
- Employee/Manager implementation isolation;
- Shared independence from Employee/Manager internals;
- Platform shell/context independence from capability internals;
- Core capability independence;
- canonical localization architecture files and retirement of obsolete Shared/Employee localization bridges;
- DOM/storage independence of extracted lifecycle/session/domain modules;
- approved persistence access across all Employee/Manager capability modules, with only the documented Manager return-marker compatibility exception;
- centralized Manager enhancement scheduling;
- stable Manager semantic identities;
- centralized feature-flag construction/registration and default-OFF policy;
- semicolon-independent static ES-module dependency parsing for architecture-boundary checks;
- storage/API hardening invariants;
- circular ES-module dependency detection;
- DAST fail-closed configuration;
- design-system CSS ownership.

Static import checks cannot prove runtime authorization, Tenant scoping, session rotation, reset atomicity or shared-state propagation; those remain database, integration, E2E and security-review responsibilities.

The detailed SaaS 2 Tenant Admin constraints, including the approved section set and section-isolation expectations, are maintained in `docs/SAAS2-MODULAR-BOUNDARIES.md` and their corresponding architecture fixtures/checks. Architecture rules and their regression fixtures must change together.

The SaaS 3 Platform Operator artifact and Customer/operator deployment isolation are governed by `docs/SAAS3-PLATFORM-CONTROL-PLANE.md`. The Platform boundary gate rejects cross-entry-point authority imports, customer capability internals in the operator artifact, Customer/operator session reuse, Production-to-Demo fallback, browser-owned Platform authority, and a Production manifest that serves both entry points on one origin. The Customer Demo gate rejects LocalStorage business authority, browser role authority and API-failure fallback.

Architecture checks must represent architectural intent. Do not add arbitrary line-count or file-count gates. Filenames may be enforced when they are established public contracts/entry points. When a new meaningful boundary is introduced, assess whether the architecture gate must be extended.

Some rules cannot be proven reliably by static import checks alone, including whether Platform/Shared have become semantically over-broad, whether a public API export is genuinely justified, whether a compatibility bridge is still necessary, and whether a feature flag is stale. Those remain mandatory review responsibilities in addition to automated enforcement.

## Testing and regression protection

Existing behavior on current `main` is the baseline. New functionality requires progression tests; changes affecting existing behavior require regression coverage.

Valid tests that describe observable baseline behavior must not be weakened merely because architecture changes make the implementation inconvenient. Tests may be updated when only implementation-coupled import paths change and observable behavior remains the same; that distinction should be documented in the PR.

Feature-flagged functionality requires OFF-state baseline protection and ON-state progression coverage.

Required repository validation remains:

```bash
npm run check
npm run audit
npm run test:e2e
```

Run `npm run test:e2e` when browser/runtime/UI behavior could be affected. GitHub Actions executes the quality gate, high-severity dependency audit, Chromium/WebKit E2E coverage, Dependency Review and Secret Scan. DAST remains a separate scheduled/manual repository security control. CodeQL must not be claimed unless it is separately configured and executed.

## Pull-request discipline

Architecture changes must remain reviewable. Do not combine unrelated runtime decomposition, localization consolidation, persistence migration, design-system changes, new features or feature-flag cleanup when they can be independently reviewed.

An architectural PR should state:

- responsibility changed;
- previous and new ownership;
- public-contract impact;
- regression impact;
- tests executed/added;
- security impact;
- architecture-gate impact.

After implementation, required validation, review and merge succeed, the resulting `main` becomes the next functional and architectural baseline.

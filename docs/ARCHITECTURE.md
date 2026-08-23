# Conference Manager Architecture

## Architecture principles

The repository is a build-free native ES-module application. `main` is the repository source of truth. The immutable functional baseline for the modular refactoring is commit `4b6f333e1f246944069a923f71a1c007f85484f2` and is documented in `docs/BASELINE.md`.

Architectural changes must preserve observable behavior, persisted data, DOM/test contracts, localization, accessibility behavior and security boundaries.

The runtime dependency direction is:

```text
Browser / index.html
  -> src/app.js composition/bootstrap
     -> Platform application shell/context
     -> Employee public module API
     -> Manager public module API
        -> shared cross-capability presentation/contracts
           -> core domain and infrastructure primitives
```

`src/core` must not depend on Employee or Manager modules. `src/shared` must not depend on Employee or Manager modules. Employee modules must not depend on Manager modules. Consumers outside Employee or Manager must use the respective `index.js` public API rather than private implementation files.

## Runtime structure

```text
src/
├── app.js                         # composition/bootstrap only
├── core/
│   ├── api-client.js
│   ├── catalog.js
│   ├── domain.js
│   ├── i18n.js
│   ├── security-i18n.js
│   ├── security-policy.js
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
│   └── Manager experience enhancements
├── platform/
│   ├── app-shell.js               # shell/navigation/profile/help routing
│   ├── application-context.js     # shared profile/catalog/site/request context
│   ├── demo-security.js
│   ├── feature-flags.js
│   ├── feature-parity.js
│   ├── identity-bootstrap.js
│   └── requester-attribution.js
└── shared/
    ├── application-presentation.js
    ├── notifications.js
    ├── request-card.js
    ├── parity-data.js
    └── parity-i18n.js
```

The former flat `src/features` directory is not part of the modular architecture. The architecture quality gate rejects its reintroduction.

## Responsibilities

### `src/app.js`

`src/app.js` is the application composition/bootstrap root. It is intentionally small and owns only:

- creation of the shared application context;
- construction of Employee and Manager capability applications through their public APIs;
- application-shell composition;
- top-level language/storage re-render registration;
- the established application build marker.

Employee/Manager business rules, persistence details, feature rendering, reusable request presentation and feature-specific event handlers do not belong in `src/app.js`.

### `src/core`

Core contains stable domain and infrastructure primitives:

- `domain.js`: scheduling/conflict validation, participant totals, cost calculation, repeat/history logic and status constants;
- `catalog.js`: catalog/site defaults and loading/localization helpers;
- `storage.js`: defensive browser persistence and named repository APIs;
- `i18n.js`: canonical Employee/Manager translation catalogue and locale-aware formatting;
- `security-i18n.js`: security-notice translations;
- `security-policy.js`: runtime/role/language policy normalization;
- `api-client.js`: defensive same-origin production API contract;
- `ui.js`: reusable safe DOM/accessibility primitives.

Core remains independent of Employee/Manager rendering and experience enhancements.

### `src/employee`

Employee owns the complete baseline Employee application behavior behind `src/employee/index.js`.

`application.js` owns the six-step request UI and Employee use-case orchestration, including draft save/restore, room/service/catering/cost/review rendering, submit/resubmit, request list/calendar, details, cancellation, repeat/change editing, guest information and print behavior.

Business/session rules that can be tested without the DOM are separated into:

- `request-session.js`: request editing state, room-availability model, cost composition, draft payload/restore and repeat/change mapping;
- `request-lifecycle.js`: final validation, submit/resubmit/cancel transitions and Employee request filtering.

Existing Employee parity/UX/accessibility modules remain within the Employee boundary and continue to be exposed through the same public facade.

### `src/manager`

Manager owns the complete baseline Conference Manager application behavior behind `src/manager/index.js`.

`application.js` owns Booking Cockpit filtering/actions, room planning, baseline reporting presentation and administration rendering/persistence orchestration.

`booking-lifecycle.js` owns testable confirm/change/reject status and calendar transitions. `reporting.js` remains the testable Manager reporting calculation model used by the enhanced reporting experience.

Manager runtime code does not import Employee internals. Existing Manager-to-Employee collaboration remains restricted to the established Employee public contract bridge used by the parity presentation layer.

### `src/platform`

Platform contains application-wide composition and infrastructure-facing concerns rather than Employee/Manager business logic.

- `application-context.js` owns loading/access to profile, catalog, site information, requests and demo role state through the existing core persistence contracts.
- `app-shell.js` owns shell navigation, welcome view, profile/help dialogs and top-level view orchestration. It receives Employee/Manager application contracts from `src/app.js` rather than importing capability internals.
- identity bootstrap, demo-security disclosure, requester attribution, feature flags and the post-render parity scheduler remain Platform responsibilities.

`feature-parity.js` remains the single coalesced enhancement scheduler. Manager enhancement modules must not add their own global synchronization loops.

### `src/shared`

Shared contains code genuinely reused across Employee and Manager and must not depend back on either capability.

- `request-card.js` owns the common request-card/timeline DOM contract and receives capability-specific actions as callbacks.
- `application-presentation.js` owns the small cross-capability form/section/KPI presentation primitives extracted from the former composition root.
- `notifications.js` owns the common notification persistence/presentation contract.
- `parity-data.js` centralizes the existing enhanced catalog/site/request presentation data helpers.
- `parity-i18n.js` is the preserved pre-existing compatibility translation catalogue.

Do not turn Shared into a generic `utils`, `helpers` or `common` dumping ground.

## Public module contracts

Public module APIs are explicit:

- Employee: `src/employee/index.js`, including `createEmployeeApplication` plus the pre-existing Employee enhancement exports.
- Manager: `src/manager/index.js`, including `createManagerApplication` plus the pre-existing Manager enhancement exports.

The application factories return capability contracts consumed by Platform composition:

- Employee runtime contract: request rendering, request-list rendering, draft restore/query/save behavior.
- Manager runtime contract: Manager application rendering.

Cross-capability rendering is handled by Shared presentation contracts. A consumer outside a capability must not import a private capability implementation file.

## Separation of domain, application and UI concerns

The repository remains intentionally lightweight; no artificial service/interface hierarchy is introduced. The practical direction is:

```text
Capability UI / rendering
  -> capability application/use-case orchestration
     -> testable lifecycle/session/domain rules
        -> core persistence/domain/infrastructure primitives
```

`request-session.js`, `request-lifecycle.js`, `booking-lifecycle.js` and `reporting.js` must remain independent of browser rendering APIs. Rendering modules may consume those rules, not the reverse.

## Feature flags

`src/platform/feature-flags.js` is the centralized feature-flag foundation.

1. Baseline behavior is not represented in the feature-flag registry.
2. A genuinely new feature receives a stable lowercase identifier.
3. New flags default to `false` unless explicitly approved otherwise.
4. Unknown, malformed and unregistered flags fail closed to disabled.
5. Runtime overrides may only affect registered identifiers.
6. Flag conditions belong at an architectural boundary, not scattered through implementation details.
7. Every new flagged feature requires OFF and ON tests.
8. Remove rollout flags when they are no longer needed.

The current baseline defines no feature flags. Moving baseline behavior into a module does not create a feature and does not require a feature flag.

## Persistence and data compatibility

The static MVP uses LocalStorage/sessionStorage. The canonical storage conventions and defensive parsing remain in `src/core/storage.js`.

The decomposition preserves without migration:

- all existing storage key names;
- request/catalog/site/profile/notification/draft object shapes;
- serialization behavior;
- request and calendar status identifiers;
- draft restore behavior;
- existing saved data.

Capability runtimes use the approved core storage/repository interfaces; direct `localStorage`/`sessionStorage` use in the newly extracted Employee/Manager application runtimes is prohibited by the Phase 2 architecture gate.

## UI, accessibility and design system

This modular refactoring is not a redesign. It preserves the baseline information architecture, terminology, DOM semantics, CSS classes, data attributes, E2E selectors, navigation, responsive behavior, keyboard/focus behavior and accessible dialog/form behavior.

Global design decisions remain exclusively in `assets/tokens.css`. CSS ownership remains defined in `docs/DESIGN-SYSTEM.md`; Phase 2 introduces no new CSS architecture or visual language.

User-visible application copy remains governed by the repository i18n rules. No new visible copy was introduced by the decomposition.

## Existing i18n technical debt

`src/shared/parity-i18n.js` predates the canonical-i18n rule and remains a compatibility resource. It is intentionally not consolidated as part of the `app.js` decomposition because that would combine two independently risky changes.

New application copy must not be added there. Consolidating the legacy parity catalogue into `src/core/i18n.js` remains separately testable technical debt.

## Security boundaries

The application remains a static demo. The decomposition does not turn client-side role checks into authorization. Production authentication/authorization requirements remain defined in `docs/DEMO-SECURITY.md` and `docs/PRODUCTION-SECURITY.md`.

CSP, safe DOM creation, defensive storage, safe URL handling, API restrictions, secret scanning, dependency review and SAST-style checks remain unchanged or stronger.

## Architecture enforcement

`npm run check:architecture` executes both the Phase 1 architecture gate and `scripts/check-modular-runtime.mjs`.

Together they enforce, among other controls:

- exact runtime stylesheet/entry-point ownership;
- absence of the former `src/features` directory;
- Employee and Manager public facades;
- application composition through Employee/Manager public APIs;
- no feature/business/storage implementation leakage back into `src/app.js`;
- capability-internal module privacy outside the capability boundary;
- no Employee-to-Manager or Manager-to-Employee implementation dependency;
- no Shared dependency back into Employee/Manager;
- Platform shell/context independence from capability internals;
- DOM/storage independence of extracted lifecycle/session/domain modules;
- no direct browser-storage access from the new Employee/Manager application runtimes;
- centralized Manager enhancement scheduling;
- stable Manager semantic identities;
- feature-flag default-OFF policy;
- storage/API hardening invariants;
- circular ES-module dependency detection;
- DAST fail-closed configuration;
- design-system CSS ownership.

## Validation

Required repository validation remains:

```bash
npm run check
npm run audit
npm run test:e2e
```

GitHub Actions executes the quality gate, high-severity dependency audit, Chromium/WebKit E2E coverage, Dependency Review and Secret Scan. DAST remains a separate scheduled/manual repository security control. CodeQL must not be claimed unless it is separately configured and executed.

## Adding or extracting a capability

1. Identify baseline behavior, consumers and dependencies.
2. Add characterization/regression tests when existing coverage is insufficient.
3. Extract one cohesive responsibility rather than arbitrary functions/files.
4. Keep private implementation internal and expose only deliberate public contracts.
5. Depend on core/shared contracts; do not reach into another capability's internals.
6. Do not feature-flag moved baseline behavior.
7. Extend automated architecture enforcement for meaningful new boundaries.
8. Run all applicable quality/security/Chromium/WebKit gates before merging.

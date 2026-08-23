# Conference Manager Architecture

## Architecture principles

The repository is a build-free native ES-module application. `main` is the functional source of truth. Architectural changes must preserve observable behavior, persisted data and externally consumed contracts.

The refactoring baseline is documented in `docs/BASELINE.md`.

The target dependency direction is:

```text
Browser / index.html
  -> Platform composition
     -> Employee public module API
     -> Manager public module API
        -> shared compatibility/domain presentation resources
           -> core domain and infrastructure primitives
```

`src/core` must not depend on Employee or Manager modules. `src/shared` must not depend on Employee or Manager modules. Employee modules must not depend on Manager modules. Manager-to-Employee collaboration must use an explicit public contract rather than importing Employee internals.

## Runtime structure

```text
src/
├── app.js
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
│   ├── index.js
│   └── Employee experience implementations
├── manager/
│   ├── index.js
│   └── Manager experience implementations
├── platform/
│   ├── demo-security.js
│   ├── feature-flags.js
│   ├── feature-parity.js
│   ├── identity-bootstrap.js
│   └── requester-attribution.js
└── shared/
    ├── parity-data.js
    └── parity-i18n.js
```

The former flat `src/features` directory is not part of the modular architecture. The architecture quality gate rejects its reintroduction.

## Responsibilities

### `src/app.js`

`src/app.js` remains the primary baseline application composition and rendering module. It owns the existing view state, request wizard rendering, baseline Manager rendering and the established user-flow orchestration.

It is intentionally not rewritten as part of the directory-boundary refactoring. A 75 KB composition module remains larger than the preferred target and is recorded as residual technical debt. Future decomposition must be incremental: protect the relevant behavior first, extract one coherent application/domain concern, route consumers through a stable contract, run the complete gate, and only then continue.

A future extraction must not change routes, DOM contracts relied on by E2E tests, storage keys, workflow state values or user-visible behavior merely to make the file smaller.

### `src/core`

Core contains stable application primitives and infrastructure abstractions:

- `domain.js`: request validation, scheduling/conflict rules, participant totals, cost calculation, repeat/history logic and status constants.
- `catalog.js`: catalog/site defaults and loading/localization helpers.
- `storage.js`: defensive browser persistence, repository APIs and named save hooks.
- `i18n.js`: canonical Employee/Manager application translation catalogue and locale-aware formatting.
- `security-i18n.js`: security-notice translations.
- `security-policy.js`: runtime/role/language policy normalization.
- `api-client.js`: defensive same-origin production API client contract.
- `ui.js`: shared DOM/accessibility primitives.

Core must remain independent of feature-specific DOM enhancement modules.

### `src/employee`

Employee owns request-experience enhancements, first-use behavior, Employee accessibility presentation, room/catering visual presentation and the printable welcome experience.

`src/employee/index.js` is the public module contract. Platform code and other modules must consume Employee behavior through this facade instead of reaching into implementation files.

### `src/manager`

Manager owns Conference Manager enhancements, room-planning/reporting presentation, Manager first-use/operational behavior, responsive representation, semantic Manager tab identity and administration enhancements.

`src/manager/index.js` is the public module contract. Platform orchestration must use this facade.

The existing request-card identity dependency is isolated through `src/manager/employee-visuals.js`, which delegates to the Employee public API. It exists to preserve byte-identical baseline implementations during incremental migration; it must not grow into a second implementation.

### `src/platform`

Platform contains application-wide bootstrap/composition concerns rather than business capability logic:

- identity bootstrap;
- demo security disclosure/control behavior;
- requester-attribution repository hook registration;
- the single post-render enhancement scheduler;
- centralized feature-flag definitions and resolution.

`feature-parity.js` is the single coalesced enhancement scheduler. Manager enhancement modules must not add their own global synchronization loops.

### `src/shared`

Shared contains code that is genuinely used across Employee and Manager boundaries and must not depend back on either module.

`parity-data.js` centralizes the existing enhanced catalog/site/request presentation data helpers.

`parity-i18n.js` is a pre-existing compatibility translation resource used by the parity enhancements. It predates the central-i18n rule and is retained unchanged in this structural refactoring to avoid silently changing user-visible copy. New application copy must not be added there; new copy belongs in `src/core/i18n.js`. Consolidating the existing parity catalogue into the canonical catalogue is residual technical debt and requires dedicated regression coverage because it affects a large amount of visible DE/EN copy.

## Public module contracts

Public module APIs are explicit and intentionally small:

- Employee: `src/employee/index.js`
- Manager: `src/manager/index.js`

A consumer outside a module must not import another module's private implementation file. If collaboration is required, add the smallest stable capability to the module's public facade or extract a genuinely shared abstraction.

Do not create generic `utils`, `helpers` or `common` dumping grounds.

## Feature flags

`src/platform/feature-flags.js` is the centralized feature-flag foundation.

Rules:

1. Baseline behavior is not represented in the feature-flag registry.
2. A genuinely new feature receives a stable lowercase identifier such as `booking.new-capability`.
3. The identifier is added to `FEATURE_FLAG_DEFAULTS` with `false` unless an explicitly approved requirement states otherwise.
4. Unknown, malformed and unregistered flags fail closed to disabled.
5. Runtime overrides may only affect registered identifiers.
6. Flag conditions belong at an architectural boundary, not scattered throughout implementation details.
7. Every new flagged feature requires OFF and ON tests.
8. Remove rollout flags when they are no longer needed; do not use flags as permanent architecture.

The current baseline defines no feature flags.

## Persistence and data compatibility

The static MVP uses LocalStorage/sessionStorage. Stored values are untrusted input and are defensively normalized by `src/core/storage.js` and related policy code.

Refactoring must preserve:

- existing storage key names;
- request/catalog/site/profile/notification object shapes;
- request/status identifiers;
- existing saved data without reset or destructive migration.

Any future schema migration requires an explicit compatibility strategy, tests and rollback considerations.

## UI, accessibility and design system

Architectural refactoring is not a redesign. The existing information architecture, terminology, navigation, interaction behavior, responsive rules, loading/empty/error states, focus behavior and keyboard behavior remain baseline contracts.

Global design decisions remain exclusively in `assets/tokens.css`. CSS ownership remains defined in `docs/DESIGN-SYSTEM.md`; the modular JavaScript reorganization does not create new feature-specific CSS layers.

User-visible application copy remains governed by the repository i18n rules. New text must use stable translation keys rather than hardcoded bilingual branches.

## Security boundaries

The application remains a static demo and does not gain fake client-side authentication or authorization through refactoring. The security boundary is documented in `docs/DEMO-SECURITY.md` and `docs/PRODUCTION-SECURITY.md`.

The refactor must preserve CSP, safe DOM rendering, defensive storage, safe URL handling, production API restrictions, repository hooks, secret scanning, dependency review, SAST-style checks and DAST behavior.

Security controls must move only when their behavior and trust boundary remain equivalent or stronger.

## Architecture enforcement

`scripts/check-architecture.mjs` is part of `npm run check` and enforces, among other controls:

- exact runtime stylesheet ownership;
- platform entry-point ownership;
- absence of the former flat `src/features` directory;
- Employee and Manager public facades;
- no direct Employee-to-Manager dependency;
- no Manager dependency on Employee internals outside the explicit public-contract bridge;
- no shared-module dependency back into Employee/Manager;
- centralized Manager enhancement scheduling;
- stable semantic Manager tab/action identities;
- requester-attribution repository-hook behavior;
- feature-flag foundation and default-OFF policy;
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

GitHub Actions executes the quality gate, high-severity dependency audit, Chromium/WebKit E2E coverage, Dependency Review and Secret Scan. DAST and CodeQL remain separate repository security controls where configured.

A successful build or syntax check alone is not sufficient evidence that an architectural refactoring preserved behavior.

## Adding a new module

When a new business capability becomes large enough to justify a module:

1. Identify the business owner/capability and the public contract first.
2. Add characterization/regression tests for existing behavior before moving implementation.
3. Create a capability directory under `src` rather than a technical dumping-ground directory.
4. Keep private implementation internal and expose only a small `index.js` facade when cross-module use is required.
5. Depend on core/shared abstractions; do not reach into another module's internals.
6. Put genuinely new functionality behind a registered default-OFF flag when required by rollout policy.
7. Update the architecture gate when a boundary must become machine-enforced.
8. Run all applicable quality/security/E2E gates before merging.

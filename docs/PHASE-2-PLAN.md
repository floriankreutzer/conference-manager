# Phase 2 — Application Composition Decomposition

## Baseline

The immutable functional baseline remains `main` commit `4b6f333e1f246944069a923f71a1c007f85484f2`.

Phase 1 modular boundaries were verified and merged through PR #40. Phase 2 is based on the resulting `main` commit `bd64a5eded5b5ad8ab3eec4d4550327450182db4` and does not weaken the Phase 1 architecture, security or quality gates.

## Completed extraction sequence

1. Characterized Employee request-session, draft, availability, cost and lifecycle behavior before changing runtime consumers.
2. Characterized Manager confirm/change/reject transitions before changing runtime consumers.
3. Verified the unchanged runtime checkpoint with repository quality, dependency, secret and Chromium/WebKit E2E gates.
4. Extracted Employee request rendering/orchestration behind `src/employee/index.js`.
5. Extracted Manager booking, room-planning, reporting and administration rendering/orchestration behind `src/manager/index.js`.
6. Extracted application context and shell concerns into `src/platform`.
7. Extracted genuinely shared request-card, notification and presentation behavior into `src/shared`.
8. Reduced `src/app.js` to application composition/bootstrap and application-level re-render registration.
9. Added `scripts/check-modular-runtime.mjs` to enforce the Phase 2 boundaries in `npm run check:architecture`.
10. Verified the switched runtime with the complete Chromium/WebKit E2E suite before documentation-only finalization.

## Compatibility constraints

The decomposition preserves without migration or redesign:

- LocalStorage/sessionStorage keys and persisted structures;
- request/calendar status values and history semantics;
- draft save/restore semantics;
- visible DE/EN behavior;
- DOM semantics, classes, data attributes and E2E selectors;
- keyboard/focus/accessibility behavior;
- responsive behavior and existing CSS ownership;
- feature-parity runtime contracts and the baseline application build marker.

Existing baseline behavior is not registered as a feature flag. The legacy parity i18n catalogue remains intentionally separate technical debt.

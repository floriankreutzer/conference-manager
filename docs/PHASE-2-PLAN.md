# Phase 2 — Application Composition Decomposition

> Historical implementation record. This document describes the completed Phase 2 migration and its checkpoints. It is not a current baseline definition or a normative architecture instruction. Current `main` is the functional and architectural baseline; root `AGENTS.md` contains the permanent repository architecture rules.

## Historical Phase 2 references

During Phase 2, commit `4b6f333e1f246944069a923f71a1c007f85484f2` was used as the pre-refactoring functional comparison checkpoint. Phase 1 modular boundaries were verified and merged through PR #40, and Phase 2 was based on the resulting `main` commit `bd64a5eded5b5ad8ab3eec4d4550327450182db4`.

These commit references are retained only for audit/migration history. They do not override the rolling baseline lifecycle defined in `AGENTS.md` and `docs/BASELINE.md`.

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

## Compatibility constraints used during the migration

The decomposition preserved without migration or redesign:

- LocalStorage/sessionStorage keys and persisted structures;
- request/calendar status values and history semantics;
- draft save/restore semantics;
- visible DE/EN behavior;
- DOM semantics, classes, data attributes and E2E selectors;
- keyboard/focus/accessibility behavior;
- responsive behavior and existing CSS ownership;
- feature-parity runtime contracts and the baseline application build marker.

Existing functionality was not registered as a feature flag merely because it was refactored. The legacy parity i18n catalogue remains intentionally separate technical debt.
# Phase 2 — Application Composition Decomposition

## Baseline

The immutable functional baseline remains `main` commit `4b6f333e1f246944069a923f71a1c007f85484f2`.

Phase 1 modular boundaries were verified and merged through PR #40. Phase 2 is based on the resulting `main` commit `bd64a5eded5b5ad8ab3eec4d4550327450182db4` and must not weaken the Phase 1 architecture, security or quality gates.

## Extraction sequence

1. Characterize request-session and lifecycle behavior before changing `src/app.js` consumers.
2. Extract Employee request rendering/orchestration behind the Employee public API.
3. Extract Manager booking, room-planning, reporting and administration rendering/orchestration behind the Manager public API.
4. Extract application shell concerns to Platform where they are not Employee/Manager capability behavior.
5. Reduce `src/app.js` to bootstrap/composition and application-level event registration.
6. Extend architecture checks to enforce the resulting boundaries.
7. Run the full repository quality, dependency, secret and Chromium/WebKit E2E gates.

Each extraction must preserve storage keys and shapes, status values, DOM/test contracts, localization behavior, accessibility behavior and existing visible output.

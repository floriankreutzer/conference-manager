# Functional and Architectural Baseline

## Authoritative baseline lifecycle

The current `main` branch is the functional and architectural baseline for all repository work.

The baseline advances through this lifecycle:

```text
current main
  -> scoped implementation/refactoring
  -> regression, security and architecture verification
  -> review and merge
  -> resulting main becomes the next baseline
```

Do not permanently anchor future development to an older refactoring commit. Historical commits and pull requests may be referenced for audit, incident analysis or migration history, but they do not override current `main`.

Existing baseline functionality must remain operational unless an explicit requirement changes it. Moving or refactoring existing functionality does not turn it into a new feature and does not, by itself, justify a feature flag.

This document records baseline behavior and compatibility contracts. The mandatory repository instructions remain `AGENTS.md` and the standards it references, especially `docs/CODING-STANDARDS.md`. The current architecture is described in `docs/ARCHITECTURE.md`.

## User-visible baseline

### Employee experience

- Welcome dashboard with open/upcoming/today information and notifications.
- Six-step request workflow: schedule, room, services, catering, cost allocation, review.
- Draft autosave and restore.
- Room filtering and final validation by location, active state, capacity and simulated calendar conflicts.
- Internal and external participant counts.
- Catering packages, individual items, catering participant count and dietary requirements.
- Cost-center allocation with per-entry and total validation.
- Request submission, edit/resubmission after a change request, cancellation and repeat-request behavior.
- Request list, calendar, history, guest information and printable welcome information.
- German and English presentation, keyboard/focus behavior and responsive phone layouts.

### Conference Manager experience

- Booking cockpit, search/status/location filters and operational quick filters.
- Confirmation, change request and rejection decisions.
- Room-planning timeline and responsive list representation.
- Reporting for bookings, participants, room use, services and catering.
- Master-data administration for rooms, sites, services, catering packages and individual items.
- Desktop and mobile behavior including responsive table/card representations.

## Architectural baseline

The modular runtime merged into `main` is part of the baseline:

- `src/app.js` is the Composition Root.
- Employee implementation is owned by `src/employee` and consumed externally through `src/employee/index.js`.
- Manager implementation is owned by `src/manager` and consumed externally through `src/manager/index.js`.
- `src/platform` owns approved cross-cutting runtime composition/integration concerns.
- `src/shared` contains only genuinely cross-capability abstractions with stable meaning.
- `src/core` remains capability-independent and owns established foundational/domain/infrastructure primitives.
- centralized feature flags and automated modular-runtime/circular-dependency architecture checks remain mandatory.

The permanent normative architecture rules are in root `AGENTS.md`. `docs/ARCHITECTURE.md` documents the current structure and enforcement details.

## Technical compatibility contracts

The baseline preserves the following contracts unless a separately approved requirement explicitly changes them:

- `index.html` remains the static application entry point.
- The application remains build-free native ES modules; no framework or bundler is introduced without an explicit architecture decision.
- Existing view identities and DOM behavior remain stable for the regression/E2E suite unless an approved product requirement changes them.
- Existing LocalStorage/sessionStorage keys and stored object shapes remain compatible unless an explicit, tested migration is approved.
- Request workflow status values and calendar status values remain unchanged unless explicitly changed by a product requirement.
- Catalog identifiers, request identifiers, allocation structures and persisted history remain compatible.
- The static demo runtime remains explicitly declared through `conference-runtime=demo`.
- The production API/security boundary documented in `docs/PRODUCTION-SECURITY.md` remains authoritative for production security design.
- CSS ownership and the design-token source of truth remain defined by `docs/DESIGN-SYSTEM.md` and `assets/tokens.css`.
- Existing CI/CD and security gates remain required unless deliberately replaced by stronger approved controls.

## Baseline test evidence

The repository protects baseline behavior through Node regression/security tests and Playwright browser tests.

Node coverage includes:

- domain validation and calculations;
- Employee request-session and lifecycle behavior;
- Manager booking lifecycle and reporting behavior;
- API-client security behavior;
- storage compatibility and fail-closed persistence;
- runtime/demo security policy;
- fuzz/input-manipulation security cases;
- requester attribution;
- centralized feature-flag behavior;
- architecture and instruction consistency checks through the repository quality gate.

Browser coverage includes Employee and Manager workflows, responsive behavior, accessibility/focus behavior, security, print behavior, design-system constraints and Chromium/WebKit/iPhone profiles.

Refactoring may update test import paths when implementation files move. Assertions that describe valid observable baseline behavior must not be weakened or removed merely to make a structural change pass.

## Feature-flag compatibility rule

A file move, extraction, facade, adapter or refactoring of baseline behavior is not a new feature. Existing behavior remains enabled and is not added to the feature-flag registry merely because its implementation moves.

Genuinely new optional functionality must be evaluated under the centralized feature-flag rules in `AGENTS.md` and `docs/ARCHITECTURE.md`. New flags default OFF, unknown flags fail closed, and stale rollout flags must be removed once controlled rollout/rollback is no longer required.

## Historical audit checkpoints

Earlier refactoring commits and PRs remain useful as historical evidence only. For example, commit `4b6f333e1f246944069a923f71a1c007f85484f2` was the pre-modular-refactoring functional checkpoint, while PRs #40 and #41 established the modular boundaries and Composition Root. These references must not be treated as the permanent baseline for future work.
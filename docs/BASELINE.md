# Functional Baseline

## Authoritative reference

The functional baseline for the modular architecture refactoring is `main` commit `4b6f333e1f246944069a923f71a1c007f85484f2` (2026-08-23).

This document records behavior and contracts that the refactoring must preserve. It is not a replacement for `AGENTS.md`, `docs/CODING-STANDARDS.md`, the security documents, or the design system.

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

## Technical contracts

The refactoring preserves the following contracts unless a separately approved change explicitly changes them:

- `index.html` remains the static application entry point.
- The application remains build-free native ES modules; no framework or bundler is introduced.
- Existing view identities and DOM behavior remain stable for the regression/E2E suite.
- Existing LocalStorage/sessionStorage keys and stored object shapes remain compatible.
- Request workflow status values and calendar status values remain unchanged.
- Catalog identifiers, request identifiers, allocation structures and persisted history remain unchanged.
- The static demo runtime remains explicitly declared through `conference-runtime=demo`.
- The production API/security boundary documented in `docs/PRODUCTION-SECURITY.md` remains unchanged.
- CSS ownership and the design-token source of truth remain unchanged.
- Existing CI/CD, GitHub Pages assumptions and security workflows remain unchanged.

## Baseline test evidence

The repository already protects the baseline through Node regression/security tests and Playwright browser tests.

Node coverage includes:

- domain validation and calculations;
- API-client security behavior;
- storage compatibility and fail-closed persistence;
- runtime/demo security policy;
- fuzz/input-manipulation security cases;
- reporting behavior;
- requester attribution.

Browser coverage includes Employee and Manager workflows, responsive behavior, accessibility/focus behavior, security, print behavior, design-system constraints and Chromium/WebKit/iPhone profiles.

Refactoring may update import paths in tests when implementation files move. Assertions that describe baseline behavior must not be weakened or removed merely to make a structural change pass.

## Refactoring compatibility rule

A file move, extraction, facade or adapter is not a new feature. Existing behavior remains enabled and is never added to the feature-flag registry.

Only genuinely new behavior introduced after this baseline may be registered as a feature flag. Such flags default to OFF unless an explicitly approved requirement says otherwise.

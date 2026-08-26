# SaaS 2 modular frontend boundaries

## Status

This document defines the permanent frontend architecture constraints introduced for SaaS 2. It extends the existing capability boundaries; it does not replace the repository architecture or coding standards.

## Tenant Admin ownership

`src/tenant-admin` owns Tenant self-service presentation and application orchestration. Employee, Conference Manager, Shared, Core and Platform must not own Tenant settings business rules.

The SaaS 2 settings information architecture uses these bounded sections:

- `organization`
- `locations`
- `catalog`
- `booking-policies`
- `cost-allocation`
- `users`
- `microsoft365`
- `capabilities`
- `audit`

Each section lives below `src/tenant-admin/sections/<section-id>/` and exposes an `index.js` public contract. Section internals are private. A section must not import another section; collaboration is expressed through an injected public contract owned at the appropriate boundary.

## Shell and adapter rules

The settings shell and section registry own only registration, authorized navigation, headings, focus, loading, empty and error orchestration. They do not own catalogue, pricing, policy, cost-allocation, Microsoft, audit or User lifecycle decisions.

Section applications receive Production or Demo adapters through explicit composition. They do not import Platform APIs directly. Production modules must never import Demo modules, and a failed Production API/session/configuration path must never select a Demo adapter or browser-local authority.

The Composition Root selects the runtime and adapters. Demo adapters and fixtures remain deterministic, resettable and visibly non-production.

## Automated enforcement

`npm run check:architecture` runs all existing architecture checks and `scripts/check-saas2-module-boundaries.mjs`. The SaaS 2 gate:

- rejects source import cycles;
- rejects unresolved relative imports;
- protects section-private modules;
- rejects cross-section dependencies;
- rejects direct section dependencies on Platform, Employee or Conference Manager;
- rejects Production-to-Demo imports;
- rejects generic `utils`, `helpers` or `common` dumping-ground modules and directories;
- restricts section identities to the approved information architecture.

`tests/saas2-module-boundaries.test.js` contains positive and intentionally invalid virtual module fixtures. Architecture rules must be changed together with these regression tests and an explicit architecture decision.

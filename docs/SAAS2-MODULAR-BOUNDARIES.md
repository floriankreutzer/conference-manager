# SaaS 2 modular frontend boundaries

## Status

Implemented and merged to `main` with PR #136 (`Add modular Tenant Admin settings shell`) on 2026-08-27. The resulting delivery commit is `6a56ce4f355765d21176c496740afd318a559b47`.

This document preserves the SaaS 2 delivery record and defines the permanent frontend architecture constraints introduced by that work. It extends the existing capability boundaries; it does not replace the repository architecture or coding standards.

### Roadmap Version 11 amendment

Roadmap Approved Version 11 (2026-09-01), roadmap issue #164 and role-model issue #166 supersede the SaaS 2 actor allocation wherever this historical document assigns Catalogue or Room-business administration to Tenant Admin. The section-isolation, explicit-adapter, composition-root, Production/Demo-separation and public-contract rules remain mandatory. The current normative ownership contract is `docs/ROLE-MODEL.md`.

This amendment changes authority and current composition, not the historical fact of what PR #136 delivered. Historical lists and code references below are retained as delivery evidence and must not be copied as current authorization or registry instructions.

The implementation preserves the SaaS 1 production trust model: browser presentation is not an authorization boundary, Production authority continues to come from the validated server session and backend APIs, and no Production path falls back to Demo authority or browser-stored Tenant roles.

## Delivered behavior and verification

PR #136 delivered the bounded Tenant Admin settings shell and explicit section registry while retaining the existing User role administration and Microsoft 365 onboarding/connection implementations as independently owned sections.

Delivered behavior includes:

- an overview/readiness landing area rather than implicitly opening a settings sub-capability;
- authorized section navigation and bounded `#tenant-admin/<section>` deep links;
- restoration of authorized Tenant Admin routes on reload without persisting Production authority in the browser;
- cleanup of Tenant Admin hashes when the user leaves the Tenant Admin top-level view, including authorization normalization back to Welcome;
- keyboard-accessible section navigation and section-heading focus on explicit navigation;
- regression coverage that a successful User role save restores focus to the updated User card; other section-internal rerenders remain owned by their section and are not claimed to restore focus automatically;
- synchronized German and English Tenant Admin copy;
- responsive Tenant Admin shell behavior covered by Chromium and WebKit/iPhone E2E profiles;
- no new framework, router, generic service locator, parallel translation mechanism or browser-side Production authority.

Final PR-head validation for `f6cf71f3b8d6a3283b80ab1b78a12e8c27c0766d` completed successfully before merge:

- repository `quality` gate, including locked dependency installation, high-severity dependency audit, syntax, SAST-style, secret and regression checks;
- Dependency Review;
- Gitleaks Secret Scan;
- browser E2E, including Chromium and WebKit/iPhone coverage.

The GitHub Advanced Security AI finding workflow reported a separate model/configuration infrastructure failure during the PR lifecycle; it was not a code finding and was not used to bypass any required repository gate.

## Tenant Admin ownership

`src/tenant-admin` owns Tenant Admin self-service presentation and application orchestration. Its Organization, technical Locations, Booking Policies, Cost Allocation, Users, integrations, readiness and audit business rules must not leak into Employee, Conference Manager, Shared, Core or Platform. Conversely, Conference Manager Room-business and Catalogue rules remain outside `src/tenant-admin`; Shared and Platform may expose only the bounded cross-capability contracts described by the current architecture.

As delivered by SaaS 2 PR #136, the settings information architecture used these bounded sections:

- `organization`
- `locations`
- `catalog`
- `booking-policies`
- `cost-allocation`
- `users`
- `microsoft365`
- `capabilities`
- `audit`

Each section delivered in that registry lived below `src/tenant-admin/sections/<section-id>/` and exposed an `index.js` public contract. The current sections retain the same rule: section internals are private, a section must not import another section, and collaboration is expressed through an injected public contract owned at the appropriate boundary.

Under the current Version 11 contract:

- `organization`, `booking-policies`, `cost-allocation`, `users`, `microsoft365`, `capabilities` and `audit` remain bounded Tenant Admin sections behind their exact permissions;
- `locations` is a Tenant Admin technical surface for Sites, stable Room assignment and provider mapping only; it preserves Conference Manager-owned Room business fields;
- `catalog` is no longer a Tenant Admin section or adapter. Catalogue, Room prices and Room-business presentation are composed under Conference Manager through its independent permissions;
- a dual-role session composes both capability families as the exact server-issued union rather than creating a new role or weakening either boundary; and
- historical mixed-ownership Location snapshots are metadata only in a single-role Tenant Admin surface and do not expose a rollback mutation.

Successful Organization, Booking Policies and Cost Allocation saves now restore focus to the current section heading. Their section-owned asynchronous continuations must verify the current connected render before announcing, rerendering, presenting conflict recovery or consuming the focus request. This extends the original explicit-navigation and Users-save focus contracts without moving section lifecycle ownership into the shell.

## Shell and adapter rules

The settings shell and section registry own only registration, authorized navigation, shared page headings, explicit-navigation focus and the fallback for an unexpectedly rejected section render. Each section owns its normal loading, empty, conflict and error presentation. The shell and registry do not own catalogue, pricing, policy, cost-allocation, Microsoft, audit or User lifecycle decisions.

Section applications receive Production or Demo adapters through explicit composition. They do not import Platform APIs directly. Production modules must never import Demo modules, and a failed Production API/session/configuration path must never select a Demo adapter or browser-local authority.

The Composition Root selects the runtime and adapters. Demo adapters and fixtures remain deterministic, resettable and visibly non-production.

Top-level view changes are reported through a generic application-shell callback. Tenant Admin route cleanup is composed in `src/app.js`; Platform does not import Tenant Admin internals. This keeps dependency direction explicit while ensuring stale Tenant Admin hashes cannot reopen the capability after the user navigates elsewhere.

## Stylesheet ownership

`assets/app-layout.css` remains the single public application-layout entry point declared by `index.html`. It composes the stable application foundation and the bounded Tenant Admin layouts. `assets/app-layout-foundation.css` is the pre-existing application-wide layout responsibility; `assets/tenant-admin-settings.css` owns the Tenant Admin shell and shared settings-section presentation; `assets/tenant-admin-operations.css` owns only User lifecycle, Microsoft 365 operational recovery, effective-capability and audit-history presentation. None is an alternative runtime implementation, and all remain subject to the shared design-token gate.

## Automated enforcement

`npm run check:architecture` runs all existing architecture checks and `scripts/check-saas2-module-boundaries.mjs`. The SaaS 2 gate:

- rejects source import cycles;
- rejects unresolved relative imports;
- protects section-private modules;
- rejects cross-section dependencies;
- rejects direct section dependencies on Platform, Employee or Conference Manager;
- rejects Demo imports from Production-named modules covered by the static boundary policy;
- rejects generic `utils`, `helpers` or `common` dumping-ground modules and directories;
- restricts section identities to the current approved information architecture, including the absence of a Tenant Admin Catalogue section.

Composition Root Production/Demo runtime selection cannot be proven completely by this static gate; it remains covered by regression tests, security review and runtime validation.

`tests/saas2-module-boundaries.test.js` contains positive and intentionally invalid virtual module fixtures. Architecture rules must be changed together with these regression tests and an explicit architecture decision.

## Delivery traceability

- Roadmap parent: #74
- Delivery issue: #80
- Implementation PR: #136
- Merge commit: `6a56ce4f355765d21176c496740afd318a559b47`
- Application build delivered by the implementation: `2026.08.27.70`
- Current ownership supersession: Roadmap Approved Version 11 (2026-09-01), #164 and #166

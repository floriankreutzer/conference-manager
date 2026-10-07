# Conference Manager

## SaaS 3.9 infrastructure and repository boundary

The accepted SaaS 3.9 repository boundary uses private application/API source, authenticated immutable hosted delivery and intentionally public Website/Developer publication. On 7 October 2026, the owner temporarily made the Application and API repositories public to restore Actions execution; GitHub metadata confirmed both were public. This is a dated exception to the accepted private-source boundary, not a change to the authenticated delivery mechanism. The supported static Demo entry is the website's EN/DE landing. Legacy application Pages is disabled and the private historical Archive is archived. Effective post-private security and release evidence are defined in [SAAS-3.9-INFRASTRUCTURE-SECURITY.md](docs/SAAS-3.9-INFRASTRUCTURE-SECURITY.md); #254 records final acceptance and milestone closure.
Frontend application for Tenant-scoped conference requests with Employee, Conference Manager and Tenant Admin capabilities plus a separately deployed Platform Operator surface.

## Current release boundary

As of 7 October 2026, SaaS 3.9 issue #254 records the historical accepted cutover. PR #279 is merged as `f9d0439c410d2e97a60984f6bf9a05216a6b3862` after successful CI (including both shared browsers, actual 200% zoom and three-customer/two-reset progression), Hosted Acceptance, ZAP, Dependency Review and full-history Secret Scan. SaaS 3.6 final release issues #170/#164 remain open. API PR #114 fixes the sharp/librsvg finding and is merged as `dccd86b3dc1eb208423407f104686aff347581ef`; both existing Render Free services now serve that exact runtime with frontend `5d5102b4f9842ec704ff26441ebe96719324ddb0`. Their readiness and build-bound identities were verified. Refreshed paired Hosted/DAST acceptance remains required before this successor is accepted; the older #279 evidence does not certify it. Merged ready markers describe the scoped accepted Demo UX, not completion of those remaining final release gates. Read the current [release evidence](docs/SAAS-3.6-RELEASE-EVIDENCE.md) and [PR #279](https://github.com/floriankreutzer/conference-manager/pull/279) before inferring final acceptance.

## Readiness status

- Employee UX: **ready** for the accepted SaaS 3.6 Demo scope
- Conference Manager UX: **ready** on the tested desktop/mobile browser matrix
- Technical markers: `conference-end-user-readiness=ready` and `conference-manager-readiness=ready`
- Regression coverage: required quality/security, ordinary Chromium/WebKit, PostgreSQL cross-role/CSV, actual 200% tab zoom and permanent three-customer/two-reset acceptance.

The #182 parity gate and #170 release gate control this promotion. Accepted named
Owner decisions #172/#182 and bounded Demo disposition #216 remain binding.
The final #229 correction is merged through #259; Guest PDF #256, Catering media
#226 and compact worklist #228 are integrated through #257. Executed baseline
evidence and the immutable live pair are recorded in
[SAAS-3.6-RELEASE-EVIDENCE.md](docs/SAAS-3.6-RELEASE-EVIDENCE.md). #170 records the final protected promotion,
live identity and closure; a branch marker alone never proves a deployed release.

Readiness is scoped Demo UX acceptance. It does not certify Production, live
Microsoft/Entra/provider operation, formal WCAG, tagged PDF, penetration testing,
isolated HTTP recovery, retention deletion or Production RPO/RTO. Those independent
evidence boundaries remain unchanged.

The Business CSV contract in [MANAGER-BUSINESS-CSV.md](docs/MANAGER-BUSINESS-CSV.md) covers authoritative
named Site/Room/item selections, localized help, bounded strict UTF-8 CSV and
receipt-bound Equipment transfer at canonical schema 42.

## Feature scope

- Six-step employee workflow: date/time → room → services → catering → cost allocation → review
- Final room validation against location, capacity, active status, and simulated calendar occupancy
- Provisional reservation, confirmation, change request, rejection, and cancellation
- Editing and resubmission of change requests
- Server-authoritative post-confirmation room, schedule and participant changes with Conference Manager approval
- Catering packages, individual options, separate catering participant count, and dietary requirements
- Cost-center allocation with 0–100% validation and total validation
- List, calendar, request history, guest information, and printable welcome view
- Conference Manager cockpit with Tenant-wide Request operations, room planning, operational reports, Room business-data administration, Tenant Catalogue administration, and authoritative Room prices
- Tenant Admin administration for organization, booking policy, cost allocation, Users and elevated roles, provider integrations and technical Room/provider mapping
- Independent, additive Conference Manager and Tenant Admin roles, including an exact dual-role permission union on top of the implicit Employee baseline
- German and English through the canonical Core application localization contract
- Server-backed Demo persistence in one isolated PostgreSQL database, shared by the separately authenticated Customer and Platform Demo processes

## SaaS 3.6 role and ownership baseline

Every active customer User receives the implicit Employee baseline. `conference_manager` and `tenant_admin` are independent elevated roles: neither inherits the other, and a User assigned both receives the exact permission union. Browser navigation reflects the validated server session but never establishes authorization.

Conference Manager owns same-Tenant operational Request management, Room business fields, the Service/Equipment/Catering Catalogue, and authoritative Room prices. An eligible Conference Manager may decide a self-initiated operational change only with distinct server-derived initiator/decider audit evidence. Tenant Admin owns organization, booking policy, cost allocation, Users/elevated roles, Tenant audit, provider integration, Site configuration, stable Room identity, technical Room-to-Site assignment, and provider mapping. Provider-controlled identifiers remain immutable through normal business editing. A mixed Room mutation requires both elevated roles, and customer workflows cancel or archive referenced records instead of physically deleting historical Requests or provider-backed Rooms. SaaS 3.6 does not assign cost or cost-center reporting to a customer role.

The complete canonical matrix, field split and security invariants are documented in [ROLE-MODEL.md](docs/ROLE-MODEL.md). Server-side authorization in `conference-manager-api` remains authoritative; frontend visibility is not an access control.

This section records the approved SaaS 3.6 contract. GitHub issues, protected pull requests, final-head checks, merged commits and deployment evidence remain authoritative for delivery status; this README does not claim milestone, live-deployment or external-acceptance completion.

## Repository-wide coding-agent instructions

`AGENTS.md` in the repository root is the mandatory canonical entry point for coding, architecture, refactoring, review, accessibility, security, i18n/l10n, UI/UX, and testing work.

The complete engineering requirements are maintained in [CODING-STANDARDS.md](docs/CODING-STANDARDS.md). Agent-specific files must only import or point to the canonical `AGENTS.md` and must not create parallel rule sets.

Current repository entry points:

- OpenAI Codex / ChatGPT: `AGENTS.md`
- GitHub Copilot: `AGENTS.md` plus `.github/copilot-instructions.md`
- Claude Code: `CLAUDE.md` imports `AGENTS.md`
- Gemini CLI: `GEMINI.md` imports `AGENTS.md`
- Cursor and Windsurf: root `AGENTS.md`

`npm run check:agents` verifies the instruction files and is part of the mandatory repository quality gate. Repository files cannot override an external IDE or agent configuration that deliberately disables repository instructions; within the repository, however, instruction drift is detected by CI.

## Repository structure

```text
.
├── .github/
│   ├── copilot-instructions.md
│   ├── dependabot.yml
│   └── workflows/
├── assets/
│   ├── tokens.css
│   ├── styles.css
│   ├── app-layout.css
│   ├── employee-ux.css
│   ├── manager-layout.css
│   └── demo-security.css
├── docs/
│   ├── ARCHITECTURE.md
│   ├── BASELINE.md
│   ├── CODING-STANDARDS.md
│   ├── DEMO-SECURITY.md
│   ├── DEMO-URLS.md
│   ├── DESIGN-SYSTEM.md
│   ├── PHASE-2-PLAN.md
│   ├── PRODUCTION-SECURITY.md
│   ├── ROLE-MODEL.md
│   ├── SAAS-3.6-HARDENING-REGISTER.md
│   ├── SAAS-3.6-SECURITY-REGRESSION.md
│   ├── SAAS3-PLATFORM-CONTROL-PLANE.md
│   └── SAAS-PRODUCTION-TOPOLOGY.md
├── scripts/
│   ├── check-agent-instructions.mjs
│   ├── check-architecture.mjs
│   ├── check-modular-runtime.mjs
│   ├── check-design.mjs
│   ├── check-i18n.mjs
│   ├── check-secrets.mjs
│   ├── check-static.mjs
│   └── localization-inventory.mjs
├── src/
│   ├── app.js
│   ├── core/
│   ├── employee/
│   ├── manager/
│   ├── platform/
│   ├── platform-admin/
│   ├── shared/
│   └── tenant-admin/
├── tests/
│   ├── e2e/
│   └── *.test.js
├── AGENTS.md
├── CLAUDE.md
├── GEMINI.md
├── index.html
├── package.json
└── README.md
```

## Architecture and design system

The runtime is organized around explicit capability boundaries. `src/employee/index.js`, `src/manager/index.js` and `src/tenant-admin/index.js` are the customer capability public APIs. `src/platform` owns application context, shell/bootstrap, cross-cutting orchestration and the feature-flag foundation. `src/shared` contains genuinely cross-capability presentation/contracts, while `src/core` contains stable domain and infrastructure primitives including the canonical application localization architecture.

`src/app.js` is the composition/bootstrap root only. The Employee request workflow, draft/request lifecycle, request rendering and Employee event handling live behind the Employee public API. Conference Manager booking, room-planning, reporting and business-settings behavior live behind the Manager public API. Tenant organization/policy/cost/User/provider administration remains behind the Tenant Admin public API. Testable request/booking and ownership rules are separated from browser rendering where practical.

The operational application uses a restrained consulting/business visual language with Bordeaux as the primary accent and Camel as an intentional surface color. Global design decisions are maintained exclusively in `assets/tokens.css`.

CSS responsibilities remain consolidated: `assets/employee-ux.css` owns Employee-specific experience presentation and `assets/manager-layout.css` owns all Manager-specific experience presentation. The JavaScript decomposition introduces no new CSS architecture or visible redesign.

Employee and Manager each have one canonical server-backed renderer behind their public module API. Historical browser-authority renderers, post-render parity/polish chains and the parallel parity stylesheet are removed; architecture gates reject their reintroduction even as unreachable files.

New user-visible application copy belongs to the canonical Core localization mechanism and is rendered through `t()`. Employee and Manager own no translation catalog or compatibility adapter; retired-renderer-only messages were removed with those paths.

The approved SaaS production topology keeps this repository as the browser application and places the trusted production backend in a dedicated `conference-manager-api` repository while exposing the customer browser and `/api/*` through one HTTPS origin. The accepted SaaS 3 extension adds a separately deployable Platform Operator artifact and operator origin backed by a Platform-only process in the same backend repository; it does not add Platform authority to Tenant Admin or existing customer `src/platform` modules.

The accepted SaaS 3.5 architecture keeps Platform Operations source in those two application repositories while preserving the four separate browser/API artifacts and processes. It replaces browser-owned Demo business state with one isolated PostgreSQL-backed Demo model reached through separate Customer and Platform Demo session/API boundaries. SaaS 3.5 remains the topology and persistence baseline; its historical descriptions of Tenant Admin editing all Locations/Rooms/Catalogue data do not define current authorization. The approved SaaS 3.6 role model in [ROLE-MODEL.md](docs/ROLE-MODEL.md) and the current ownership matrix supersede only that earlier role allocation while preserving the accepted topology.

SaaS 3.9 places the static human Demo launchpad in the public website at `https://floriankreutzer.github.io/conference-manager-website/en/demo/` (German: `/de/demo/`) for the separate Render Customer and Platform application origins. It is not an application, identity, session, API, proxy, persistence or authorization layer. [DEMO-URLS.md](docs/DEMO-URLS.md) records the canonical topology and live URL evidence.

See [BASELINE.md](docs/BASELINE.md), [ROLE-MODEL.md](docs/ROLE-MODEL.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md), [DOMAIN-OWNERSHIP-AND-MODULE-BOUNDARIES.md](docs/DOMAIN-OWNERSHIP-AND-MODULE-BOUNDARIES.md), [SAAS-PRODUCTION-TOPOLOGY.md](docs/SAAS-PRODUCTION-TOPOLOGY.md), [SAAS3-PLATFORM-CONTROL-PLANE.md](docs/SAAS3-PLATFORM-CONTROL-PLANE.md), [ADR-009-PLATFORM-OPERATIONS-REPOSITORY-TOPOLOGY.md](docs/ADR-009-PLATFORM-OPERATIONS-REPOSITORY-TOPOLOGY.md), [ADR-010-SHARED-SERVER-BACKED-DEMO-RUNTIME.md](docs/ADR-010-SHARED-SERVER-BACKED-DEMO-RUNTIME.md) and [DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) for details and maintenance rules.

## Feature flags

`src/platform/feature-flags.js` provides the centralized lightweight feature-flag mechanism for genuinely new application functionality.

- Baseline functionality is not feature-flagged.
- New flags must be registered centrally with a stable identifier.
- New flags default to OFF unless explicitly approved otherwise.
- Unknown or malformed flags fail closed.
- Runtime overrides can only enable registered flags.
- New flagged behavior requires tests for both OFF and ON states.

The current baseline defines no feature flags.

## Run locally

ES modules require an HTTP server. For example:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Quality gate

```bash
npm run check
```

The quality gate executes:

1. JavaScript syntax validation for source, test, and script files
2. Coding-agent instruction consistency validation
3. Canonical DE/EN i18n synchronization, placeholder parity, duplicate-definition and no-parallel-catalog checks
4. Architecture-boundary, modular-runtime, circular-dependency, CSS-ownership, enhancement-scheduling and repository-hook checks
5. Defensive static/SAST-style checks for forbidden constructs such as `eval`, `document.write`, `innerHTML` assignments, and executable URL schemes
6. Repository secret scan
7. Design-token validation against new hardcoded hex colors in component CSS
8. Regression and progression tests using the Node.js test runner

In addition, GitHub Actions runs `npm audit` and the Playwright E2E suite on Chromium and WebKit/iPhone profiles. Required quality also runs pinned Semgrep CE 1.179.0, repository rule self-tests and the full source scan. Dependency Review uses locked installation, vulnerability audit and the shared conservative SPDX license policy; Gitleaks remains required. Hosted acceptance and ZAP retain exact deployment binding. Private CodeQL is unavailable under the current entitlement and is not claimed; the scoped Semgrep policy is not identical to the complete CodeQL query suite.

## Accessibility and internationalization

The application uses semantic HTML, native form controls, and native `<dialog>` elements. User-visible text, validation messages, and accessibility text are governed by the canonical Core localization contract. The currently supported languages are `de` and `en`, and the i18n gate keeps their canonical key sets and interpolation placeholders synchronized.

The implementation targets WCAG 2.2 Level AA. A formal conformance statement additionally requires a complete manual accessibility audit with representative assistive technologies and target browsers.

## Runtime security boundary

The active Customer Demo and Platform Admin Demo are server-backed presentation tiers. They obtain separate server-issued Demo sessions from separate same-origin API processes, while canonical Demo business state is persisted in one isolated PostgreSQL database. The visible persona selectors submit only an allowlisted persona request; the appropriate server resolves the effective roles and permissions. Customer Demo personas use the same implicit Employee baseline, independent elevated roles and dual-role union as Production. Browser code, DOM values and browser storage never establish Demo or Production authority.

Only bounded non-authoritative preferences such as the selected language may remain browser-local. API, session or schema failure is rendered as unavailable and never falls back to LocalStorage, fixtures or browser mutation rules. The Demo uses deterministic non-production identities and provider adapters and is not evidence of real identity-provider, Microsoft 365 or Production acceptance.

Production operation requires at least:

- SSO through Microsoft Entra ID or an equivalent identity platform
- server-side authentication and role-based authorization
- isolated, least-privilege PostgreSQL persistence and runtime credentials
- server-side validation for all write operations
- an audit trail and transactional processing
- secure calendar integration, for example through Microsoft Graph
- security controls appropriate to the backend architecture, including CSRF protection for cookie-based authentication

The SaaS production topology fixes the trusted backend in `conference-manager-api` and keeps customer browser/API access same-origin under `/api/*`. [SAAS3-PLATFORM-CONTROL-PLANE.md](docs/SAAS3-PLATFORM-CONTROL-PLANE.md) defines the implemented separate operator artifact, origin, `/api/v1/platform/*` process, identity/session and audit boundaries. The repository implementation covers the customer production session, Employee/Conference Manager application API clients, Tenant administration, Microsoft 365 connection, guided Pilot onboarding and the separate Platform Control Plane. Repository implementation and accepted synthetic Demo evidence do not establish external Production acceptance. A deployable Pilot or Control Plane still requires the external infrastructure and acceptance evidence defined by the owning SaaS issues.

Confirmed-booking changes remain server-authoritative: proposal lookups are concurrency-bounded and isolated per Request, unavailable state fails closed, and Conference Manager decision controls are exposed only for pending proposals.

See [DEMO-SECURITY.md](docs/DEMO-SECURITY.md), [PRODUCTION-SECURITY.md](docs/PRODUCTION-SECURITY.md), [SAAS-PRODUCTION-TOPOLOGY.md](docs/SAAS-PRODUCTION-TOPOLOGY.md) and [SAAS3-PLATFORM-CONTROL-PLANE.md](docs/SAAS3-PLATFORM-CONTROL-PLANE.md) for additional details.

## Calendar integration

The synthetic Demo uses deterministic provider adapters and server-authoritative stored requests. The trusted backend implements the Microsoft 365 connection, Free/Busy and calendar create/update/cancel contracts. Real Microsoft tenant/Exchange acceptance remains an independent external gate; see [Microsoft 365 booking integration](https://github.com/floriankreutzer/conference-manager-api/blob/main/docs/BOOKING-INTEGRATION.md).

# Conference Manager

Frontend application for Tenant-scoped conference requests with Employee, Conference Manager and Tenant Admin capabilities plus a separately deployed Platform Operator surface.

## Readiness status

- Employee UX: **ready**
- Conference Manager UX: **ready** on desktop and mobile
- Technical marker: `<meta name="conference-manager-readiness" content="ready">`
- Regression coverage: dedicated Conference Manager readiness E2E test plus the complete existing Manager/Employee suite

The readiness status describes clarity, usability, responsive behavior, and regression coverage of the static MVP. It explicitly does not replace the SSO, backend, authorization, audit, and calendar-integration measures required for production operation.

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

The complete canonical matrix, field split and security invariants are documented in `docs/ROLE-MODEL.md`. Server-side authorization in `conference-manager-api` remains authoritative; frontend visibility is not an access control.

This section records the approved SaaS 3.6 contract. GitHub issues, protected pull requests, final-head checks, merged commits and deployment evidence remain authoritative for delivery status; this README does not claim milestone, live-deployment or external-acceptance completion.

## Repository-wide coding-agent instructions

`AGENTS.md` in the repository root is the mandatory canonical entry point for coding, architecture, refactoring, review, accessibility, security, i18n/l10n, UI/UX, and testing work.

The complete engineering requirements are maintained in `docs/CODING-STANDARDS.md`. Agent-specific files must only import or point to the canonical `AGENTS.md` and must not create parallel rule sets.

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
│   ├── feature-parity.css
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

`src/platform/feature-parity.js` owns the single coalesced enhancement scheduler and invokes Employee/Manager behavior through their public module APIs. Feature modules do not create parallel global synchronization loops.

New user-visible application copy belongs to the canonical Core localization mechanism and is rendered through `t()`. The former Shared parity translation catalogue has been consolidated into Core under semantic key namespaces. A temporary Manager-only `pt()` name-compatibility adapter remains for two baseline enhancement modules; it delegates directly to Core and owns no translations or fallback behavior.

The approved SaaS production topology keeps this repository as the browser application and places the trusted production backend in a dedicated `conference-manager-api` repository while exposing the customer browser and `/api/*` through one HTTPS origin. The accepted SaaS 3 extension adds a separately deployable Platform Operator artifact and operator origin backed by a Platform-only process in the same backend repository; it does not add Platform authority to Tenant Admin or existing customer `src/platform` modules.

The accepted SaaS 3.5 architecture keeps Platform Operations source in those two application repositories while preserving the four separate browser/API artifacts and processes. It replaces browser-owned Demo business state with one isolated PostgreSQL-backed Demo model reached through separate Customer and Platform Demo session/API boundaries. SaaS 3.5 remains the topology and persistence baseline; its historical descriptions of Tenant Admin editing all Locations/Rooms/Catalogue data do not define current authorization. The approved SaaS 3.6 role model in `docs/ROLE-MODEL.md` and the current ownership matrix supersede only that earlier role allocation while preserving the accepted topology.

SaaS 3.6 also bounds GitHub Pages to a static human Demo launchpad for the separate Render Customer and Platform application origins. It is not an application, identity, session, API, proxy, persistence or authorization layer. `docs/DEMO-URLS.md` records the canonical topology and must contain the exact Pages URL only after deployment evidence exists.

See `docs/BASELINE.md`, `docs/ROLE-MODEL.md`, `docs/ARCHITECTURE.md`, `docs/DOMAIN-OWNERSHIP-AND-MODULE-BOUNDARIES.md`, `docs/SAAS-PRODUCTION-TOPOLOGY.md`, `docs/SAAS3-PLATFORM-CONTROL-PLANE.md`, `docs/ADR-009-PLATFORM-OPERATIONS-REPOSITORY-TOPOLOGY.md`, `docs/ADR-010-SHARED-SERVER-BACKED-DEMO-RUNTIME.md` and `docs/DESIGN-SYSTEM.md` for details and maintenance rules.

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

In addition, GitHub Actions runs `npm audit` and the Playwright E2E suite on Chromium and WebKit/iPhone profiles. Dependency Review and Gitleaks provide additional repository security gates. DAST remains a separate scheduled/manual control. CodeQL must only be reported when separately configured and executed.

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

The SaaS production topology fixes the trusted backend in `conference-manager-api` and keeps customer browser/API access same-origin under `/api/*`. `docs/SAAS3-PLATFORM-CONTROL-PLANE.md` separately fixes the future operator artifact, origin, `/api/v1/platform/*` process, identity/session and audit boundaries. The repository implementation covers the customer production session, Employee/Conference Manager application API clients, Tenant administration, Microsoft 365 connection, and guided Pilot onboarding; the Platform Control Plane runtime is not claimed as implemented by that architecture decision. A deployable Pilot or Control Plane still requires the external infrastructure and acceptance evidence defined by the owning SaaS issues.

Confirmed-booking changes remain server-authoritative: proposal lookups are concurrency-bounded and isolated per Request, unavailable state fails closed, and Conference Manager decision controls are exposed only for pending proposals.

See `docs/DEMO-SECURITY.md`, `docs/PRODUCTION-SECURITY.md`, `docs/SAAS-PRODUCTION-TOPOLOGY.md` and `docs/SAAS3-PLATFORM-CONTROL-PLANE.md` for additional details.

## Calendar integration

The MVP simulates occupancy from stored requests. For Microsoft 365, suitable integration points include Microsoft Graph `getSchedule` or `calendarView` together with server-controlled event creation and updates.

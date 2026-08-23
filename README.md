# Conference Manager

Frontend MVP for internal conference requests with employee and conference-management views.

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
- Catering packages, individual options, separate catering participant count, and dietary requirements
- Cost-center allocation with 0–100% validation and total validation
- List, calendar, request history, guest information, and printable welcome view
- Manager cockpit with bookings, room planning, reports, and master-data administration
- German and English through the canonical Core application localization contract
- LocalStorage persistence for the static MVP

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
│   ├── DESIGN-SYSTEM.md
│   ├── PHASE-2-PLAN.md
│   └── PRODUCTION-SECURITY.md
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
│   └── shared/
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

The runtime is organized around explicit capability boundaries. `src/employee/index.js` and `src/manager/index.js` are the public module APIs. `src/platform` owns application context, shell/bootstrap, cross-cutting orchestration and the feature-flag foundation. `src/shared` contains genuinely cross-capability presentation/contracts, while `src/core` contains stable domain and infrastructure primitives including the canonical application localization architecture.

`src/app.js` is the composition/bootstrap root only. The Employee request workflow, draft/request lifecycle, request rendering and Employee event handling live behind the Employee public API. Manager booking, room-planning, reporting and administration behavior live behind the Manager public API. Testable request/booking lifecycle rules are separated from browser rendering where practical.

The operational application uses a restrained consulting/business visual language with Bordeaux as the primary accent and Camel as an intentional surface color. Global design decisions are maintained exclusively in `assets/tokens.css`.

CSS responsibilities remain consolidated: `assets/employee-ux.css` owns Employee-specific experience presentation and `assets/manager-layout.css` owns all Manager-specific experience presentation. The JavaScript decomposition introduces no new CSS architecture or visible redesign.

`src/platform/feature-parity.js` owns the single coalesced enhancement scheduler and invokes Employee/Manager behavior through their public module APIs. Feature modules do not create parallel global synchronization loops.

New user-visible application copy belongs to the canonical Core localization mechanism and is rendered through `t()`. The former Shared parity translation catalogue has been consolidated into Core under semantic key namespaces. A temporary Manager-only `pt()` name-compatibility adapter remains for two baseline enhancement modules; it delegates directly to Core and owns no translations or fallback behavior.

See `docs/BASELINE.md`, `docs/ARCHITECTURE.md` and `docs/DESIGN-SYSTEM.md` for details and maintenance rules.

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

## MVP security boundary

The current application is a static demo. Data, the demo role, and language preference are stored client-side. The demo role switch is **not authorization** and must not be used as production access control.

Production operation requires at least:

- SSO through Microsoft Entra ID or an equivalent identity platform
- server-side authentication and role-based authorization
- backend persistence instead of LocalStorage
- server-side validation for all write operations
- an audit trail and transactional processing
- secure calendar integration, for example through Microsoft Graph
- security controls appropriate to the backend architecture, including CSRF protection for cookie-based authentication

See `docs/DEMO-SECURITY.md` and `docs/PRODUCTION-SECURITY.md` for additional details.

## Calendar integration

The MVP simulates occupancy from stored requests. For Microsoft 365, suitable integration points include Microsoft Graph `getSchedule` or `calendarView` together with server-controlled event creation and updates.

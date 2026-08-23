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
- German and English through central i18n keys
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
│   └── workflows/ci.yml
├── assets/
│   ├── tokens.css
│   ├── styles.css
│   ├── feature-parity.css
│   └── demo-security.css
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CODING-STANDARDS.md
│   ├── DEMO-SECURITY.md
│   └── DESIGN-SYSTEM.md
├── scripts/
│   ├── check-agent-instructions.mjs
│   ├── check-design.mjs
│   ├── check-secrets.mjs
│   ├── check-static.mjs
│   └── check-syntax.mjs
├── src/
│   ├── app.js
│   ├── core/
│   └── features/
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

## Design system

The operational application uses a restrained consulting/business visual language with Bordeaux as the primary accent and Camel as an intentional surface color. The Manager dashboard retains its information architecture; the printable guest welcome view may remain more expressive.

Global design decisions are maintained exclusively in `assets/tokens.css`. Colors, surfaces, typography, spacing, radii, and shadows can be changed centrally there. `assets/styles.css` and `assets/feature-parity.css` use semantic tokens and must not introduce new hardcoded brand hex colors.

See `docs/DESIGN-SYSTEM.md` for details and maintenance rules.

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
2. Coding-agent instruction consistency validation for the canonical `AGENTS.md`, agent bridges/imports, detailed standards, and English-only repository instructions
3. Defensive static/SAST-style checks for forbidden constructs such as `eval`, `document.write`, `innerHTML` assignments, and `javascript:` URLs
4. Repository secret scan
5. Design-token validation against new hardcoded hex colors in component CSS
6. Regression and progression tests using the Node.js test runner

In addition, GitHub Actions runs `npm audit` and the Playwright E2E suite on Chromium and WebKit/iPhone profiles.

## Accessibility and internationalization

The application uses semantic HTML, native form controls, and native `<dialog>` elements. User-visible text, validation messages, and accessibility text are centrally managed through `src/core/i18n.js`. The currently supported languages are `de` and `en`; additional language packs can extend the same stable key set.

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

See `docs/DEMO-SECURITY.md` for additional details.

## Calendar integration

The MVP simulates occupancy from stored requests. For Microsoft 365, suitable integration points include Microsoft Graph `getSchedule` or `calendarView` together with server-controlled event creation and updates.

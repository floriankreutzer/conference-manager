# Architecture

## Runtime

The application is a build-free browser application served as native ES modules.

```text
index.html
  ├── src/app.js                    primary application state, rendering and business-flow orchestration
  └── src/features/feature-parity.js centralized enhancement scheduler
       ├── Employee enhancement modules
       └── Manager enhancement modules

src/core/
  ├── domain.js          pure business rules and validation
  ├── catalog.js         catalog defaults, localization and migration
  ├── i18n.js            canonical application translations and locale-aware formatting
  ├── security-i18n.js   security-notice translations
  ├── security-policy.js fail-closed runtime and role policy
  ├── api-client.js      defensive same-origin production API boundary
  ├── storage.js         defensive demo persistence adapters and explicit repository hooks
  └── ui.js              safe DOM and accessible dialog utilities
```

`src/app.js` owns primary application state, business-flow orchestration and rendering. `src/features/feature-parity.js` owns the single coalesced post-render enhancement scheduler. Employee and Manager enhancement modules export idempotent enhancement functions or scoped event handlers and must not register parallel document/window synchronization loops.

`src/features/manager-tabs.js` assigns and resolves stable semantic Manager tab identities (`BOOKINGS`, `ROOM_PLAN`, `REPORTS`, `ADMIN`) after each base render. Manager enhancement logic must use these identities instead of localized visible labels, so copy changes and language changes cannot alter navigation state.

Repository cross-cutting behavior that must run before persistence uses explicit named repository hooks. Feature modules must not monkey-patch core repository methods.

The static GitHub Pages build declares `conference-runtime=demo`. Missing or unknown runtime configuration is interpreted as `production`, not as demo.

## Domain boundaries

`domain.js` contains pure functions for:

- schedule and participant-bound validation
- room validity and collision detection
- cost allocation validation
- cost calculation
- request history
- repeat-request behavior

These functions are covered by Node regression/progression tests and deterministic input-manipulation tests. They remain independent from LocalStorage and the DOM and defensively tolerate malformed collection data instead of throwing.

## Accessibility

- native interactive elements are preferred over custom ARIA widgets
- modal interactions use native `<dialog>`
- validation uses `aria-invalid` and assertive live regions
- navigation and request steps expose current state with `aria-current`
- visible focus indicators are retained
- reduced-motion preferences are respected
- accessibility labels are sourced from i18n resources
- Chromium and WebKit/iPhone flows are covered by keyboard/focus regression tests

A formal WCAG 2.2 AA declaration still requires a manual audit with keyboard-only navigation and representative screen readers/browsers. Automated tests are a quality gate, not a substitute for that audit.

## Internationalization

`src/core/i18n.js` is the canonical catalogue for application and experience UI strings. `src/core/security-i18n.js` remains a dedicated resource for the isolated demo-security notice.

Feature modules must not define their own bilingual copy maps or select translations with local language ternaries. Compatibility adapters may delegate to the canonical `t()` API but must not contain independent message tables. The i18n quality gate verifies German/English key parity and guards these boundaries.

Supported languages:

- `de`
- `en`

Dates are stored in ISO 8601-compatible forms and formatted only for display. Additional languages must extend the same stable message-key model rather than introducing source-language strings into feature logic.

## Security model

The static MVP applies defensive browser-side coding practices:

- no `eval`
- no `document.write`
- no application `innerHTML` assignments
- user-controlled content is rendered through `textContent`
- externally opened routes are restricted to HTTPS and use `noopener noreferrer`
- parsed LocalStorage data is handled defensively
- runtime and role values are allowlisted
- unknown runtime configuration fails closed to production semantics
- production API calls are designed as HTTPS-only, same-origin, JSON-only requests with CSRF protection for unsafe methods

The static client is **not** a security boundary. Demo roles in LocalStorage only control presentation. Production authorization must be enforced by a trusted backend/identity layer.

The mandatory production boundary, including SSO/OIDC, server-side RBAC, CSRF, transactional calendar booking, SSRF controls, parameterized persistence, audit logging, and HTTP security headers, is defined in `docs/PRODUCTION-SECURITY.md`.

## Quality gate

`npm run check` runs syntax checks, agent-instruction checks, i18n architecture/key-parity checks, architecture-consolidation checks, static defensive-code checks, secret checks, design-token checks, domain regression/progression tests, API-security tests, runtime-policy tests, requester-attribution tests and deterministic malformed-input/fuzz tests. GitHub Actions executes the same gate for pushes and pull requests. Browser CI additionally runs the Playwright suite on Chromium desktop and WebKit/iPhone.

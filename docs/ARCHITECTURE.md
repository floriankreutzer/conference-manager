# Architecture

## Runtime

The application is a build-free browser application served as native ES modules.

```text
index.html
  └── src/app.js
       ├── core/domain.js          pure business rules and validation
       ├── core/catalog.js         catalog defaults, localization and migration
       ├── core/i18n.js            application translations and locale-aware formatting
       ├── core/security-i18n.js   security-notice translations
       ├── core/security-policy.js fail-closed runtime and role policy
       ├── core/api-client.js      defensive same-origin production API boundary
       ├── core/storage.js         defensive demo persistence adapters
       └── core/ui.js              safe DOM and accessible dialog utilities
```

`src/app.js` owns orchestration and rendering. Core modules must not depend on application DOM state unless their purpose explicitly requires browser state.

The static GitHub Pages build declares `conference-runtime=demo`. Missing or unknown runtime configuration is interpreted as `production`, not as demo.

## Domain boundaries

`domain.js` contains pure functions for:

- schedule validation
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

User-visible application strings are separated from behavior logic and stored in i18n resources:

- `core/i18n.js`
- `core/security-i18n.js`

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

`npm run check` runs syntax checks, static defensive-code checks, secret checks, design-token checks, domain regression/progression tests, API-security tests, runtime-policy tests, and deterministic malformed-input/fuzz tests. GitHub Actions executes the same gate for pushes and pull requests. Browser CI additionally runs the Playwright suite on Chromium desktop and WebKit/iPhone.

# Architecture

## Runtime

The application is a build-free browser application served as native ES modules.

```text
index.html
  └── src/app.js
       ├── core/domain.js   pure business rules and validation
       ├── core/catalog.js  catalog defaults, localization and migration
       ├── core/i18n.js     translations and locale-aware formatting
       ├── core/storage.js  defensive MVP persistence adapters
       └── core/ui.js       safe DOM and accessible dialog utilities
```

`src/app.js` owns orchestration and rendering. Core modules must not depend on application DOM state unless their purpose is explicitly UI-related.

## Domain boundaries

`domain.js` contains pure functions for:

- schedule validation
- room validity and collision detection
- cost allocation validation
- cost calculation
- request history
- repeat-request behavior

These functions are covered by Node regression/progression tests and should remain independent from LocalStorage and the DOM.

## Accessibility

- native interactive elements are preferred over custom ARIA widgets
- modal interactions use native `<dialog>`
- validation uses `aria-invalid` and assertive live regions
- navigation and request steps expose current state with `aria-current`
- visible focus indicators are retained
- reduced-motion preferences are respected
- all accessibility labels are sourced from the i18n layer

A formal WCAG 2.2 AA declaration requires a manual audit with keyboard-only navigation and representative screen readers/browsers.

## Internationalization

All application UI strings use stable keys from `core/i18n.js`.

Supported languages:

- `de`
- `en`

Dates are stored in ISO 8601-compatible forms and formatted only for display. Additional languages should extend the same message key set rather than introducing source-language replacements.

## Security model

The static MVP applies defensive browser-side coding practices:

- no `eval`
- no `document.write`
- no application `innerHTML` assignments
- user-controlled content is rendered through `textContent`
- externally opened routes are restricted to HTTPS and use `noopener noreferrer`
- parsed LocalStorage data is handled defensively

The static client is **not** a security boundary. Demo roles in LocalStorage only control presentation. Production authorization must be enforced by a trusted backend/identity layer.

## Quality gate

`npm run check` runs syntax checks, static defensive-code checks and domain tests. GitHub Actions executes the same command for pushes and pull requests.

# Coding Standards

This document contains the mandatory detailed engineering standards for `conference-manager`. It is referenced by the root `AGENTS.md` and must be followed for every code creation, modification, refactoring, and code review.

The repository's existing architecture, design system, component patterns, CSS conventions, i18n structure, security boundaries, and test strategy must be understood before implementation. Reuse suitable existing solutions and avoid parallel implementations, one-off patterns, and unnecessary technical debt.

## 1. Web standards and semantic markup

- Use valid HTML5 and CSS according to current W3C/WHATWG standards.
- Use semantic elements according to their actual purpose, including `header`, `nav`, `main`, `section`, `article`, `aside`, `footer`, `button`, `form`, `fieldset`, `table`, and `dialog`.
- Avoid unnecessary wrappers and non-semantic container-heavy markup.
- Prefer native HTML behavior over custom JavaScript/ARIA implementations.
- Interactive elements must match their semantic purpose. Do not use a clickable `div` as a substitute for `button` or `a`.
- Keep the DOM logical, understandable, and maintainable.

## 2. Accessibility

All user interfaces must be implemented with WCAG 2.2 Level AA as the target baseline.

Consider at least:

- complete keyboard operability,
- meaningful and visible focus indication,
- `:focus-visible`,
- logical focus order,
- no keyboard traps,
- skip links where required,
- sufficient color contrast,
- understandable labels and descriptions,
- accessible forms,
- accessible validation and error messages,
- status and success messages exposed to assistive technologies,
- correct heading hierarchy,
- appropriate alternative text,
- screen-reader compatibility,
- semantic tables,
- accessible dialogs and modals,
- meaningful link and button names,
- sufficiently large touch targets,
- zoom and text enlargement without loss of functionality,
- `prefers-reduced-motion`,
- no information conveyed by color alone.

### ARIA

Principle: **No ARIA is better than bad ARIA.**

Use ARIA only when native HTML cannot provide the required semantics.

When ARIA is necessary:

- use roles, states, and properties correctly,
- use `aria-label`, `aria-labelledby`, and `aria-describedby` deliberately,
- announce relevant dynamic changes through suitable live regions,
- keep `aria-expanded`, `aria-selected`, `aria-current`, `aria-invalid`, and similar states synchronized with the actual UI state.

Accessibility must be evaluated functionally, not only visually. Components must make sense with keyboard navigation and screen readers.

## 3. Internationalization (i18n)

The application must remain fully internationalizable from the start.

Mandatory rules:

- Do not hardcode new user-visible text.
- Route all UI text through the existing central translation-key mechanism.
- Do not implement translation logic directly inside UI components.
- Do not construct sentences from multiple independently translated fragments.
- Translations must represent complete semantic units.
- Use the existing translation mechanism for placeholders and parameters.
- Handle singular, plural, and grammatical variants in a locale-aware way.
- Do not assume a fixed text length or word order.
- Components must remain functional with substantially longer translations.

Do not write logic equivalent to:

```js
const message = 'Welcome ' + userName;
```

Use a complete translation key with `userName` as an interpolation parameter through the repository's existing i18n API. Do not invent a second translation API.

## 4. Localization (l10n)

Format all locale-dependent values according to the active locale, including:

- dates,
- time,
- time zones,
- numbers,
- decimal separators,
- thousands separators,
- percentages,
- currencies,
- units of measurement.

Prefer established platform APIs such as:

- `Intl.DateTimeFormat`,
- `Intl.NumberFormat`,
- `Intl.RelativeTimeFormat`,
- `Intl.PluralRules`.

Do not manually format localized values.

For APIs, persistence, and machine-readable values, use standardized formats where applicable:

- ISO 8601 for date/time values,
- explicit time zones or UTC,
- ISO 4217 for currencies,
- ISO 639 for language codes,
- ISO 3166 for country identifiers.

Keep internal data representation separate from localized UI presentation.

## 5. Language and layout support

The architecture must not assume one language.

Account for:

- different text lengths,
- line wrapping,
- long German compound words,
- different date formats,
- different numeric formats,
- dynamic labels,
- responsive translations.

If the product can be used internationally, keep the UI structurally compatible with right-to-left languages.

Prefer CSS logical properties such as:

- `margin-inline`,
- `padding-inline`,
- `inset-inline`,
- `border-inline`,
- `text-align: start`,
- `text-align: end`.

Use physical `left`/`right` positioning only when the meaning is truly physical rather than writing-direction-dependent.

## 6. Consistent UI/UX

Before implementing or changing a component, check whether the repository already contains suitable:

- components,
- design tokens,
- form patterns,
- buttons,
- inputs,
- cards,
- dialogs,
- tables,
- navigation elements,
- status indicators,
- error patterns,
- responsive patterns.

Reuse existing suitable components and patterns instead of duplicating them.

The UI must be:

- understandable,
- predictable,
- consistent,
- error tolerant,
- efficient,
- responsive,
- touch friendly,
- accessible.

For relevant functionality, account for at least these states:

- default,
- hover,
- focus,
- active,
- selected,
- disabled,
- loading,
- empty,
- success,
- warning,
- error.

Users must be able to understand:

1. Where am I?
2. What can I do?
3. What will happen after an action?
4. Did my action succeed?
5. How can I correct an error?

## 7. Responsive design

Implement new and changed user interfaces responsively.

Baseline rules:

- mobile first,
- no page-level horizontal overflow,
- no desktop-only component assumptions,
- use flexible Grid/Flexbox layouts,
- prefer relative sizing such as `rem`, `%`, `min()`, `max()`, and `clamp()`,
- introduce breakpoints only when the content/layout requires them,
- do not clip content at small viewports or zoomed layouts.

For relevant UI changes, consider and test as appropriate:

- smartphone,
- tablet,
- desktop,
- large desktop,
- portrait,
- landscape,
- browser zoom to at least 200%.

Wide two-dimensional content may scroll horizontally only inside an intentional bounded container. The page itself must continue to reflow.

## 8. CSS architecture and design system

`assets/tokens.css` is the source of truth for global visual decisions.

Mandatory rules:

- Use existing design tokens.
- Do not repeatedly hardcode colors, spacing, typography, radii, shadows, or comparable design values.
- Define reusable values centrally.
- Respect existing CSS conventions.
- Avoid unnecessary inline styles.
- Avoid excessively specific selectors.
- Avoid unnecessary `!important`.
- Avoid global CSS rules with unintended cross-component effects.
- Keep components visually and technically isolated.
- Do not duplicate CSS rules when a shared rule or token is appropriate.
- Do not introduce arbitrary pixel values when a suitable token already exists.
- Prefer relative units where appropriate.
- Prefer native CSS functions and modern layout techniques.
- Do not create a second visual language for Manager, Employee, or other application areas.

Follow the CSS responsibility boundaries defined in `docs/DESIGN-SYSTEM.md`.

## 9. Security

Implement defensively in line with current OWASP Top 10 principles.

Depending on scope, consider at least:

- XSS,
- CSRF,
- SQL/NoSQL injection,
- command injection,
- path traversal,
- SSRF,
- broken access control,
- authentication/session weaknesses,
- unsafe deserialization,
- unsafe file uploads,
- information disclosure.

Mandatory security rules:

- Never trust input.
- Validate data at trust boundaries.
- Encode or render output safely for its context.
- Do not inject untrusted HTML. In the current frontend, prefer safe DOM APIs such as `textContent` for user-controlled content.
- Use parameterized queries when persistence is introduced.
- Do not perform dynamic code execution from user input.
- Do not store secrets in source code.
- Do not log confidential data.
- Enforce permissions server-side.
- Never treat client-side validation as a security control.
- Apply least privilege.
- Use secure defaults.
- Fail closed for unknown security-sensitive runtime or policy states where appropriate.

Where relevant, also consider:

- Content Security Policy,
- secure cookies,
- `HttpOnly`,
- `Secure`,
- suitable `SameSite` configuration,
- CSRF protection,
- rate limiting,
- security headers.

The boundaries and requirements defined in the existing repository security documentation are mandatory.

## 10. Privacy and logging

Do not unnecessarily store, transmit, log, or persist personal or confidential information in the browser.

Logs must not contain, unless strictly necessary and explicitly protected:

- passwords,
- tokens,
- secrets,
- session IDs,
- personal information.

Apply data minimization and purpose limitation.

## 11. Code quality

Follow:

- Clean Code,
- DRY,
- SOLID,
- separation of concerns,
- single responsibility,
- the repository's established architecture patterns.

For this repository:

- use modern ECMAScript,
- keep native ES modules,
- follow the established source structure and conventions,
- do not introduce a new build toolchain or framework dependency without an explicit architectural decision.

Prefer functions and components that are:

- small,
- clearly named,
- testable,
- reusable where appropriate.

Avoid:

- unnecessary abstractions,
- magic numbers,
- magic strings,
- duplicated logic,
- hidden side effects,
- oversized components,
- oversized functions.

## 12. Typing and data models

When the language or a future part of the project supports static typing:

- use strict typing where feasible,
- avoid `any`,
- define data models explicitly,
- validate API responses at trust boundaries,
- handle `null` and `undefined` deliberately,
- never treat external data as trusted by default.

In the current JavaScript code, validate data shapes defensively and handle malformed input predictably.

## 13. Error handling

Errors must be:

- handled technically correctly,
- logged safely and meaningfully,
- presented understandably to users.

Do not expose internal stack traces, database errors, implementation details, internal identifiers, or security-sensitive information to users unless there is a legitimate product need.

User-facing errors must be localized and accessible.

## 14. Testing

Test every change at a level appropriate to its risk and scope.

Depending on the change, consider:

- unit tests,
- integration tests,
- regression tests,
- progression tests for new functionality,
- end-to-end tests,
- accessibility tests,
- security tests.

New functionality requires appropriate new tests. Existing behavior must not change unintentionally.

Repository baseline:

```bash
npm run check
npm run audit
```

For relevant UI/browser changes:

```bash
npm run test:e2e
```

`npm run check` is the repository quality gate and includes the available syntax, defensive static/SAST-style, secret, design-token, agent-instruction, and regression/progression checks.

Do not remove, weaken, bypass, or rewrite tests only to make an incorrect implementation pass.

## 15. Accessibility testing

For relevant UI changes, verify at least as applicable:

- keyboard navigation,
- focus order,
- focus indicator,
- semantic HTML,
- ARIA correctness,
- form labels,
- validation/error messages,
- color contrast,
- zoom/reflow,
- screen-reader-relevant semantics.

If automated accessibility checks are added, tools such as `axe-core` may be used when introduced consistently with the current architecture.

Automated accessibility tests do not replace manual usability checks with keyboard and representative assistive technologies.

## 16. i18n and localization testing

Test internationalization/localization concerns, including:

- missing translation keys,
- fallback language behavior,
- pluralization,
- interpolation variables,
- different date formats,
- numbers and currencies,
- different text lengths.

Use pseudo-localization where it provides value for finding hardcoded text or layout assumptions.

The existing `de` and `en` resources must not drift apart when relevant strings change.

## 17. Browser compatibility

Use web technologies according to the supported browser matrix.

Do not introduce browser- or device-specific solutions where a standards-based solution exists.

Critical behavior must be checked in supported engines. Current CI/E2E coverage includes at least:

- Chromium,
- WebKit including an iPhone profile.

Consider Firefox when the browser matrix is expanded or when a change presents known engine-specific risk.

## 18. Performance

For frontend changes, consider:

- unnecessary re-renders or DOM recalculation,
- unnecessary network requests,
- bundle/asset size as applicable to the build-free architecture,
- image size,
- lazy loading,
- layout shifts,
- render-blocking resources.

Do not trade away accessibility, security, or code clarity for minor performance gains.

## 19. Understand existing code first

Before changing existing code:

1. analyze relevant files and dependencies,
2. identify existing components and utilities,
3. inspect the design system and CSS tokens,
4. inspect the i18n structure,
5. inspect existing tests,
6. assess effects on other functionality.

Then change only what is required for the requested outcome.

Do not blindly copy poor existing patterns. Identify relevant violations and correct them inside the current scope where practical without triggering an uncontrolled repository-wide refactor.

## 20. Definition of Done

Code is complete only when the following are demonstrably true for the concrete scope:

- the feature behaves correctly,
- existing functionality has not regressed,
- UI/UX remains consistent,
- responsive behavior works,
- WCAG 2.2 AA requirements have been considered,
- keyboard operation works where relevant,
- i18n/l10n is implemented consistently,
- no new hardcoded user-visible strings were introduced,
- relevant security requirements were addressed,
- existing design tokens and components were reused where suitable,
- CSS contains no unnecessary one-off solutions,
- relevant tests exist and pass,
- no evident syntax, lint, type, test, build, or runtime errors remain.

Do not claim formal WCAG, security, or browser compliance unless the necessary runtime, browser, assistive-technology, or security verification was actually performed.

## 21. Existing problems and requirement conflicts

If existing code violates these standards:

- do not copy the bad pattern by default,
- identify violations relevant to the current change,
- correct them within scope when practical,
- avoid uncontrolled refactoring outside scope.

Use this default priority order for engineering trade-offs:

1. Security
2. Correctness
3. Accessibility
4. Data integrity
5. User experience
6. Maintainability
7. Performance
8. Visual detail

## 22. DevSecOps and QA expectations

For code creation, extension, refactoring, and review, systematically consider:

- regression of existing behavior,
- progression coverage for new behavior,
- SAST-oriented risks mapped to OWASP Top 10 and relevant CWE classes,
- XSS, CSRF, injection, broken access control, SSRF, and comparable trust-boundary risks,
- dependencies and known vulnerabilities,
- secrets,
- secure configuration and fail-safe defaults,
- negative, malformed, boundary, and edge-case inputs.

Security measures must operate at the real architecture and trust boundary. Do not present client-side checks as server-side protection.

## 23. Compliance checklist for every code or code-review response

Every code creation, code modification, refactoring, or code-review response must end with a concise evidence-based compliance checklist.

Use only these statuses:

- ✅ fulfilled
- ⚠️ partial / not fully verifiable
- ➖ not applicable
- ❌ not fulfilled

The checklist must cover at least:

- HTML/W3C and semantics checked
- WCAG 2.2 AA / accessibility considered
- keyboard and focus behavior considered
- i18n implemented without new hardcoded UI strings
- l10n / locale-aware formatting considered
- responsive behavior checked
- existing UI/UX and design system followed
- CSS / design tokens used consistently
- OWASP / security considerations checked
- Clean Code / DRY / SOLID considered
- regression impact considered
- appropriate tests added or verified

Mark an item as fulfilled only when the concrete change and actual verification support the claim. If an item was not implemented, is not relevant, or could not be verified, state that explicitly with the appropriate status.
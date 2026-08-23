# Repository-Wide Agent Instructions

These instructions are mandatory for every human contributor and every AI coding agent that analyzes, reviews, creates, modifies, refactors, or validates code in `conference-manager`.

This includes, without limitation, OpenAI Codex / ChatGPT, GitHub Copilot, Claude Code, Gemini CLI, Cursor, Windsurf, and any other coding agent operating on this repository.

## 1. Canonical source of truth

- This root `AGENTS.md` is the mandatory entry point for repository work.
- The detailed engineering requirements in `docs/CODING-STANDARDS.md` are mandatory and form part of these instructions.
- Agent-specific instruction files may only import or point to this file. They must not create a parallel or conflicting rule set.
- All repository-wide coding and agent instructions must be written in English.
- If an agent cannot read this file or the referenced coding standards, it must not modify the repository. It must report that the required instructions could not be loaded.

## 2. Mandatory workflow before any change or code review

Before writing, editing, refactoring, or reviewing code:

1. Read this `AGENTS.md` completely.
2. Read `docs/CODING-STANDARDS.md` completely.
3. Treat `main` as the repository source of truth and determine the current target/base ref.
4. Read the current version of every existing file before modifying it. When using the GitHub Contents API, use the current blob SHA for updates.
5. Inspect the relevant architecture, design-system, security, i18n, and test documentation before implementation.
6. Identify existing components, utilities, patterns, tokens, translations, and tests that can be reused.
7. Assess regression, accessibility, security, internationalization, responsive, browser, and data-integrity impact.
8. Make the smallest coherent change required for the requested scope. Do not perform unrelated repository-wide refactors.

Do not bypass branch protection, required reviews, required status checks, security gates, or test gates.

## 3. Project sources that must be consulted when relevant

At minimum, use the applicable current versions of:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/DESIGN-SYSTEM.md`
- security documentation under `docs/`
- `docs/CODING-STANDARDS.md`
- `assets/tokens.css`
- relevant existing CSS files
- `src/core/i18n.js`
- `src/core/security-i18n.js` when applicable
- relevant core, feature, and test modules
- `package.json`
- `.github/workflows/ci.yml`

## 4. Existing architecture is authoritative

The current application is a build-free browser application using native ES modules. Do not introduce a framework, bundler, parallel component system, new styling architecture, or alternative i18n mechanism unless the user explicitly requests an architectural change and the impact is assessed.

Project-specific rules:

- `assets/tokens.css` is the source of truth for global visual design decisions.
- Existing semantic design tokens and component patterns must be reused before new ones are introduced.
- User-visible and accessibility text belongs in the central i18n resources; do not hardcode new UI strings.
- The static demo client is not a security boundary. Production authentication and authorization must be enforced by a trusted backend or identity layer.
- Current supported application languages are German (`de`) and English (`en`); changes must not cause them to drift.
- Current browser E2E coverage includes Chromium and WebKit/iPhone profiles.

## 5. Non-negotiable engineering priorities

When requirements conflict, use this priority order unless a higher-priority platform or user instruction requires otherwise:

1. Security
2. Correctness
3. Accessibility
4. Data integrity
5. User experience
6. Maintainability
7. Performance
8. Visual detail

All implementation and review work must follow the detailed requirements in `docs/CODING-STANDARDS.md`, including:

- valid semantic HTML5 and modern standards-based CSS,
- WCAG 2.2 Level AA-oriented implementation,
- keyboard and focus usability,
- native HTML before custom ARIA,
- complete i18n and locale-aware l10n,
- RTL-capable layout decisions where applicable,
- consistent UI/UX and responsive mobile-first behavior,
- design-token and CSS architecture discipline,
- OWASP-aligned defensive implementation,
- privacy-aware storage and logging,
- Clean Code, DRY, SOLID, and separation of concerns,
- defensive data validation and error handling,
- regression, progression, E2E, accessibility, security, and internationalization testing as appropriate,
- browser compatibility and performance checks,
- evidence-based compliance reporting.

## 6. Security and trust boundaries

Never treat client-side checks as authorization or as a substitute for server-side security controls.

At applicable trust boundaries:

- validate untrusted input,
- encode or render output safely for its context,
- avoid unsafe HTML injection and dynamic code execution,
- use parameterized persistence when persistence exists,
- enforce authorization server-side,
- keep secrets and sensitive data out of source code and logs,
- apply least privilege and secure defaults,
- fail closed for unknown security-sensitive runtime or policy states when appropriate,
- consider XSS, CSRF, injection, broken access control, SSRF, path traversal, unsafe uploads/deserialization, information disclosure, rate limiting, security headers, cookie security, and CSP where relevant.

## 7. Accessibility, i18n, and responsive behavior are functional requirements

Accessibility is not a visual-only check. Relevant UI changes must be usable with keyboard navigation, visible focus, logical focus order, semantic structure, appropriate form labeling, accessible errors/status changes, and assistive technologies.

Internationalization is mandatory from implementation time:

- no new hardcoded user-visible strings,
- no sentence construction from translated fragments,
- use complete translation units with interpolation/plural support,
- use locale-aware formatting APIs for dates, time, numbers, percentages, currency, and units,
- keep machine-readable values standardized, including ISO 8601 where applicable,
- design for longer translations and possible RTL layouts using logical CSS properties where appropriate.

Responsive behavior must avoid page-level horizontal overflow, preserve zoom/reflow, and remain usable across phone, tablet, desktop, portrait, and landscape layouts. Wide two-dimensional content may scroll only inside an intentional bounded container.

## 8. Required validation

For every code change, run or require the applicable project gates after the final modification.

Baseline:

```bash
npm run check
npm run audit
```

For relevant UI, interaction, responsive, accessibility, or browser changes:

```bash
npm run test:e2e
```

Do not remove, weaken, skip, or rewrite tests merely to make an incorrect implementation pass.

If a required test cannot be executed, report that limitation explicitly. Never claim a test or compliance result that was not actually verified.

## 9. Git and pull-request discipline

- Respect branch protection and repository rules.
- Do not write directly to protected `main` when the repository requires a pull request.
- Use the latest current file content/SHA before updates.
- Keep changes scoped and reviewable.
- Do not overwrite unrelated work.
- Do not claim a PR is ready while required checks are failing or still pending.
- Review open PR comments and unresolved review threads before finalizing a change.

## 10. Required compliance checklist in coding responses

Every code creation, code modification, refactoring, or code-review response must end with an evidence-based compliance checklist using only these statuses:

- ✅ fulfilled
- ⚠️ partial / not fully verifiable
- ➖ not applicable
- ❌ not fulfilled

The checklist must cover at least:

- HTML/W3C and semantics
- WCAG 2.2 AA / accessibility
- keyboard and focus behavior
- i18n / no new hardcoded UI strings
- l10n / locale-aware formatting
- responsive behavior
- existing UI/UX and design system
- CSS / design-token consistency
- OWASP / security considerations
- Clean Code / DRY / SOLID
- regression impact
- tests added or verified

Only mark a point as fulfilled when the concrete code and executed verification support that statement. Formal WCAG, security, browser, or runtime compliance must never be claimed without the necessary real verification.
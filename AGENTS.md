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
- relevant core, capability, platform, shared, and test modules
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

## 11. Permanent modular architecture governance

The modular runtime on current `main` is the mandatory architecture for all future work. After a change is fully verified, reviewed, and merged, the resulting `main` becomes the next functional and architectural baseline. Historical commits are audit/reference checkpoints only; they are not permanent development baselines.

Non-negotiable architecture rules:

- `src/app.js` is the Composition Root. It may bootstrap, compose top-level dependencies, initialize capabilities/the shell, register application-level events, and orchestrate explicit public contracts. Business rules, validation, lifecycle logic, persistence implementation, calculations, reporting, feature rendering, capability event handlers, reusable presentation, and capability internals do not belong there.
- Every new function or feature must have an explicit owner: Employee, Manager, Platform, Shared, Core, or a deliberately introduced capability. Placement follows responsibility, not convenience or file size.
- Employee and Manager internals are private. External consumers use `src/employee/index.js` and `src/manager/index.js`. Cross-capability interaction must use deliberate public contracts; Manager must not reach into Employee implementation details and Employee must not reach into Manager implementation details.
- Platform owns cross-cutting runtime composition/integration and must not become a replacement monolith for capability business logic. Shared is for genuinely stable cross-capability abstractions and must not become a `utils`, `helpers`, `misc`, or `common` dumping ground. Core remains capability-independent and must not absorb feature-specific business logic.
- Maintain clear dependency direction: Composition -> capability application/use-case orchestration -> independently testable business/domain rules -> approved Core/Platform infrastructure contracts. Circular dependencies and import chains created only to bypass ownership are prohibited.
- Capability runtimes must use approved persistence contracts. Do not silently add storage keys, serialization formats, restore/cache conventions, or migrations. Persistence migrations must be explicit, tested, documented, and backward-safe where practical.
- Existing baseline behavior is not feature-flagged merely because it moves or is refactored. Genuinely new optional functionality must be evaluated for the centralized feature-flag mechanism; registered flags default OFF, unknown flags fail closed, checks belong at architectural boundaries, and stale rollout flags/dead paths must be removed in dedicated cleanup changes.
- Keep significant business rules independently testable where practical; do not bury them in DOM callbacks, rendering functions, Composition Root code, or browser-storage handlers.
- Do not modularize by arbitrary line-count targets or artificial micro-modules. Future architecture refactoring must be incremental and characterization/regression protected; big-bang rewrites are prohibited unless explicitly approved.
- Do not leave parallel active business implementations. Temporary compatibility bridges require a documented migration reason and must be removed with dead code/imports after consumers migrate.
- Architecture boundaries must be enforced automatically where practical through `npm run check:architecture`, including public API privacy, Composition Root constraints, persistence restrictions, feature-flag centralization, dependency direction, and circular-dependency detection. New meaningful boundaries require an architecture-gate assessment.
- New functionality requires progression tests. Changes affecting baseline behavior require regression protection. Valid functional tests must not be weakened to accommodate an architectural implementation change; only implementation-coupled paths may change when observable behavior is preserved.
- Architecture PRs must remain reviewable and state ownership changes, public-contract impact, regression impact, tests, security impact, and architecture-gate impact. Keep runtime decomposition, i18n consolidation, storage migrations, design-system changes, new features, and feature-flag cleanup separate when they are independently reviewable concerns.

`docs/ARCHITECTURE.md` describes the current runtime structure and automated boundaries. It supports these canonical instructions; it does not override them.
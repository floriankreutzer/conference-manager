# Production Browser Session Contract

## Authority and scope

Root `AGENTS.md`, `docs/CODING-STANDARDS.md`, `docs/ARCHITECTURE.md`, `docs/PRODUCTION-SECURITY.md` and `docs/PRODUCTION-PERSISTENCE-MIGRATION.md` remain authoritative.

This document defines the browser-side production session boundary for SaaS 1 issue #115. It consumes the trusted backend contract implemented by `conference-manager-api` and does not create a second authorization system in the browser.

## Trust model

The production browser is untrusted. It may use server-provided role and permission information only to decide which presentation surfaces to show. Every protected backend operation remains server-authorized.

The flow is:

```text
Production browser
  -> same-origin HTTPS GET /api/v1/session
     -> backend resolves HttpOnly session cookie
        -> backend validates User, Tenant, role/permission snapshot and session lifecycle
           -> minimized browser presentation context
              -> Platform application context derives presentation capabilities
```

The browser must never establish Tenant, User, role, permission or object authority from LocalStorage, query parameters, form fields, URL fragments, provider claims or visible UI state.

## Session response consumed by the browser

`src/platform/production-session.js` accepts only the minimized server session contract:

- internal User UUID;
- internal Tenant UUID and bounded Tenant lifecycle status;
- canonical ordered Tenant roles;
- the exact canonical permission set implied by those roles;
- session expiry timestamp;
- CSRF token for unsafe same-origin writes.

Unknown roles, unknown permissions, malformed identifiers, missing Employee baseline, inconsistent role/permission combinations, expired sessions and malformed CSRF state fail closed.

The browser discards unrelated response metadata such as request/correlation identifiers instead of treating it as authority.

## Role and permission presentation matrix

The browser mirrors the backend role/permission vocabulary only to validate the wire contract and derive presentation capability. The backend remains authoritative.

- `employee` requires the Employee baseline permissions.
- `conference_manager` contributes `request:manage` and allows the Conference Manager presentation capability.
- `tenant_admin` contributes Tenant administration permissions and allows Tenant Administration presentation capability.

`tenant_admin` is **not** implicitly a Conference Manager. A user sees both presentation capabilities only when the server Principal contains both roles and their canonical permissions.

## CSRF and credential handling

The application session remains an HttpOnly cookie and is not exposed to JavaScript.

The CSRF token returned by `GET /api/v1/session` is held only in the in-memory production session runtime. `src/core/api-client.js` supplies it as `X-CSRF-Token` for unsafe same-origin methods. It is not written to LocalStorage or sessionStorage.

Provider access, refresh and ID tokens are not part of the browser session contract and must never be stored by this runtime.

## Authentication bootstrap

Production application composition performs session bootstrap before rendering application capability state.

- HTTP/other non-HTTPS production origins fail closed because the API client requires HTTPS.
- HTTP 401 is treated as a normal signed-out state.
- session bootstrap is aborted after a bounded timeout so a stalled endpoint renders the localized unavailable state instead of blocking the application shell indefinitely.
- malformed responses, dependency failures, transport failures and insecure configuration become `unavailable` and expose no local fallback authority.
- the explicit demo runtime does not create the production session runtime and remains behaviorally separate.

## Sign-in and logout

Sign-in navigates only to the fixed same-origin endpoint:

`/api/v1/auth/microsoft/login`

No browser-controlled redirect or Tenant selector is appended.

Logout calls:

`DELETE /api/v1/session`

through the same API client and therefore requires the in-memory CSRF token. After successful logout, local session presentation state is cleared and the browser returns to `/`.

A 401 during logout is treated as already signed out. Other failures remain visible as logout failure; the UI must not claim success while the server revocation result is unknown.

## Production capability activation boundary

A trusted session does not automatically activate every existing application view.

The current Employee and Conference Manager business views still contain demo-domain persistence paths. `docs/PRODUCTION-PERSISTENCE-MIGRATION.md` requires capability-by-capability migration to trusted backend use cases before those views may be activated in production.

Therefore:

- #115 enables trusted authentication state and presentation capability derivation;
- #114 owns production activation of Employee/Conference Manager domain views after the server-authoritative application API contract exists;
- #61 may use the trusted Tenant Admin capability for its dedicated user/role administration UI because the corresponding backend role-administration API has been implemented separately.

The Tenant Admin browser adapter follows the backend `nextAfterId` cursor until all bounded pages are loaded, rejects duplicate users/cursors and malformed page contracts, never accepts a Tenant selector, and sends only allowlisted elevated roles through the session-bound CSRF client.

The production shell returns before rendering existing demo Employee/Manager business views. This is an intentional fail-closed state, not an incomplete fallback.

## Browser storage boundary

Production authentication, roles, permissions, User ID, Tenant ID, CSRF state and session expiry are not persisted in browser storage.

The existing explicit demo role switch remains demo-only. Manipulating historical demo LocalStorage cannot promote a production user because production application context ignores that data for authority and capability checks.

## Accessibility and localization

Production sign-in, session unavailable, authenticated status and logout copy use the canonical DE/EN localization resources. Controls use native buttons and the existing shell/profile dialog semantics, keyboard behavior and focus handling.

## Verification

Repository evidence includes:

- canonical session response validation tests;
- malformed/unknown role and permission negative tests;
- expired/malformed Tenant/session/CSRF negative tests;
- fixed same-origin login/logout path tests;
- in-memory CSRF write-header tests;
- signed-out versus unavailable failure tests;
- stalled-session timeout/abort tests;
- multi-page Tenant User cursor and malformed-page tests;
- Employee/Conference Manager/Tenant Admin/combined presentation capability matrix tests;
- browser-storage authority negative tests;
- static production boundary checks preventing demo business view activation in production;
- existing demo Chromium/WebKit regression coverage.

A real secure production-session E2E with Microsoft remains deployment/external acceptance evidence and must not be claimed solely from the repository tests.

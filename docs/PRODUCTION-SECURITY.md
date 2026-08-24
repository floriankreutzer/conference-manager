# Production Security Boundary

## Status

The GitHub Pages application is an explicit **demo runtime**. It does not provide a trusted authentication, authorization, persistence, calendar, or audit boundary.

`index.html` must therefore declare:

```html
<meta name="conference-runtime" content="demo">
```

`src/core/security-policy.js` treats a missing, malformed, or unknown runtime value as `production` so configuration errors fail closed. Demo roles are only valid when the runtime is explicitly `demo`.

The repository now also contains the browser-side production session trust boundary in `src/platform/production-session.js`. That code does **not** turn the GitHub Pages deployment into production. A real production deployment still requires the trusted same-origin backend, HTTPS/security-header configuration, server persistence and operational controls defined below.

## Mandatory production architecture

A production deployment must place a trusted backend between the browser and all business data:

```text
Browser
  -> Same-origin HTTPS API
     -> Enterprise SSO / OIDC session validation
     -> Server-side RBAC and ownership checks
     -> Server-side business validation
     -> Transactional booking/calendar service
     -> Persistent database
     -> Immutable/auditable security and business events
```

The browser must never be the authorization authority. LocalStorage roles, request objects, prices, room availability, status changes, user identifiers, Tenant identifiers, permissions or cost allocations are untrusted input.

## Authentication and session controls

Production authentication uses the enterprise identity provider. The backend validates the authenticated Principal on every protected request.

Session cookies must be generated server-side and configured with:

- `Secure`
- `HttpOnly`
- `SameSite=Lax` or stricter where compatible with the SSO flow
- a narrowly scoped `Path`
- no unnecessary `Domain` attribute
- rotation after authentication and privilege changes
- server-side expiry and revocation

Long-lived bearer tokens must not be stored in LocalStorage or JavaScript-accessible browser storage.

### Browser production-session contract

`src/platform/production-session.js` is the browser-side consumer of the existing backend session contract. Its responsibilities are intentionally limited:

- read `GET /api/v1/session` through the defensive same-origin API client;
- positively validate the internal User/Tenant identifiers, canonical Tenant roles, permission set, session expiry and CSRF token;
- reject unknown roles, permissions, malformed authority data and expired sessions rather than guessing;
- keep the opaque session cookie outside JavaScript through the backend `HttpOnly` cookie contract;
- keep the CSRF token only in memory and supply it through the existing API client for unsafe methods;
- use only the fixed Microsoft login route `/api/v1/auth/microsoft/login`;
- revoke the server session with `DELETE /api/v1/session` and the CSRF contract;
- convert insecure transport, malformed session or service failures into a non-authoritative `unavailable` state rather than demo/local fallback.

The production Application Context consumes only this validated session result for presentation capability checks. It never treats those browser-side checks as backend authorization.

### Production activation boundary

A valid production session does not automatically activate existing demo business views. The current Employee and Conference Manager implementations still contain demo-domain persistence/orchestration paths. Per `docs/PRODUCTION-PERSISTENCE-MIGRATION.md`, they remain disabled in production until their server-authoritative contracts are completed under issue #114.

This means:

- unauthenticated production renders only the Microsoft sign-in state;
- an unavailable/unverifiable session renders a fail-closed retry state;
- an authenticated production session renders only safe session/profile presentation until a production capability is explicitly wired;
- the Tenant Admin role-management UI may be added independently under #61 because its dedicated backend API is already server-authoritative, but it must consume this session/CSRF boundary;
- existing demo Employee/Manager views must not be exposed merely because a trusted role is present.

## Authorization

Authorization is enforced server-side for every request and every object reference.

Current Tenant roles and permission boundaries are:

- `employee`: employee Request read/cancel permissions according to server-side ownership/workflow rules;
- `conference_manager`: Conference Manager Request read/manage permissions;
- `tenant_admin`: Tenant configuration, Tenant User administration, Tenant integration administration and Tenant audit-read permissions.

`tenant_admin` does not implicitly inherit `conference_manager`. A User receives both capability sets only when the server Principal contains both roles and their corresponding permissions. Platform Admin/operator authority remains outside this Tenant role model.

Required controls:

- object ownership checks for employee operations;
- explicit Conference Manager permission checks for manager operations;
- explicit Tenant Admin permission checks for Tenant administration;
- deny-by-default policy for unknown roles and permissions;
- no trust in client-supplied Tenant IDs, User IDs, role names, permission names, status values, prices, or ownership fields;
- protection against IDOR/BOLA by resolving resources under the authenticated Principal and authorization scope.

## CSRF

State-changing requests authenticated by cookies must use CSRF protection in addition to SameSite cookies.

`src/core/api-client.js` requires a CSRF token for `POST`, `PUT`, `PATCH`, and `DELETE`. The production backend generates and validates the token. `src/platform/production-session.js` receives the token only from the validated session response and retains it only in memory; it is not written to LocalStorage/sessionStorage or treated as application authorization by itself.

## API security contract

The production API must be same-origin and HTTPS-only. The browser client is intentionally defensive:

- same-origin API base only;
- HTTPS required;
- relative API paths only;
- path traversal and cross-origin escapes rejected;
- `credentials: same-origin`;
- redirects rejected for API calls;
- `no-store` caching;
- `no-referrer`;
- JSON request/response contract;
- response size limit;
- HTTP method allowlist.

CORS should remain disabled when the production UI and API are same-origin. If cross-origin access becomes mandatory, use an explicit origin allowlist and never reflect arbitrary `Origin` values.

The current demo HTML intentionally uses `connect-src 'none'`. It must not be copied unchanged as the production CSP because the production browser must reach the same-origin `/api/*` backend. The production deployment must deliver its CSP/security headers at the HTTP layer with the minimum same-origin connectivity required by the accepted topology; deployment evidence belongs to the production hosting/IaC work under #113.

## Server-side input validation

Every field must be validated again on the backend even when the browser already validates it. Validation must use positive schemas and explicit bounds.

At minimum validate:

- ISO 8601 dates/timestamps and allowed booking time ranges;
- participant counts and numeric ranges;
- room, service, catering, and package identifiers against authoritative catalog data;
- cost-center format and allocation totals;
- text lengths and allowed formats;
- request identifiers and workflow transitions;
- manager status-change reasons.

Use parameterized database queries or an ORM that preserves parameter binding. Never construct SQL from user-controlled strings.

## Transactional room and calendar booking

The final room availability check must be performed by the trusted backend in the same logical transaction as the reservation/confirmation operation. Client-side checks are advisory only.

The backend must prevent race conditions by using an appropriate database/calendar concurrency control, for example a transaction plus a uniqueness/exclusion constraint or another atomic reservation mechanism. A second concurrent request for the same room and overlapping time must fail deterministically rather than double-booking.

External calendar calls must use fixed service endpoints and allowlisted destinations. User input must never control arbitrary outbound URLs, protecting the service against SSRF.

## Audit trail

Security-relevant and workflow-relevant actions must be recorded server-side with an immutable or tamper-evident audit trail. Events should include:

- authenticated principal;
- action;
- target request/resource identifier;
- previous and new workflow state where applicable;
- ISO 8601 timestamp;
- correlation/request ID;
- success/failure outcome.

Do not log secrets, session cookies, CSRF tokens, or unnecessary personal data.

## Security headers

Production responses should set security headers at the HTTP layer, not rely only on HTML meta tags. At minimum assess and configure:

- Content-Security-Policy;
- Strict-Transport-Security;
- Referrer-Policy;
- X-Content-Type-Options;
- Permissions-Policy;
- frame restrictions through CSP `frame-ancestors`.

## Current repository controls

The repository currently provides:

- CodeQL Default Setup;
- dependency review;
- full-history secret scanning;
- npm dependency audit;
- static defensive-code checks;
- deterministic Node regression/progression tests;
- deterministic production-session validation, role/permission-matrix and CSRF/no-fallback tests;
- a production-persistence/session architecture gate that prevents browser-storage authority and requires the production shell to return before demo Employee/Manager views render;
- deterministic input-manipulation/fuzz tests;
- Chromium and WebKit/iPhone Playwright regression tests for the demo runtime;
- OWASP ZAP baseline scan against the deployed Pages demo.

Secure production-session browser E2E still requires an HTTPS production-like harness or deployed pilot environment. That evidence must exist before #115 is closed and must not be inferred from the demo Pages E2E suite.

These controls reduce client and supply-chain risk but do not replace the production backend trust boundary described above.

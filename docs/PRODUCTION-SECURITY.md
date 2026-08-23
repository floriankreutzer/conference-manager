# Production Security Boundary

## Status

The GitHub Pages application is an explicit **demo runtime**. It does not provide a trusted authentication, authorization, persistence, calendar, or audit boundary.

`index.html` must therefore declare:

```html
<meta name="conference-runtime" content="demo">
```

`src/core/security-policy.js` treats a missing, malformed, or unknown runtime value as `production` so configuration errors fail closed. Demo roles are only valid when the runtime is explicitly `demo`.

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

The browser must never be the authorization authority. LocalStorage roles, request objects, prices, room availability, status changes, user identifiers, or cost allocations are untrusted input.

## Authentication and session controls

Production authentication must use the enterprise identity provider. The backend must validate the authenticated principal on every protected request.

Session cookies must be generated server-side and configured with:

- `Secure`
- `HttpOnly`
- `SameSite=Lax` or stricter where compatible with the SSO flow
- a narrowly scoped `Path`
- no unnecessary `Domain` attribute
- rotation after authentication and privilege changes
- server-side expiry and revocation

Long-lived bearer tokens must not be stored in LocalStorage or JavaScript-accessible browser storage.

## Authorization

Authorization must be enforced server-side for every request and every object reference.

Minimum roles:

- `employee`: create and view own conference requests, edit requests when the workflow permits it, cancel own eligible requests
- `manager`: review eligible requests, confirm/reject/request changes, manage rooms/services/catalog data according to the assigned scope

Required controls:

- object ownership checks for employee operations
- explicit manager permission checks for manager operations
- deny-by-default policy for unknown roles and permissions
- no trust in client-supplied user IDs, role names, status values, prices, or ownership fields
- protection against IDOR/BOLA by resolving resources under the authenticated principal and authorization scope

## CSRF

State-changing requests authenticated by cookies must use CSRF protection in addition to SameSite cookies.

`src/core/api-client.js` requires a CSRF token for `POST`, `PUT`, `PATCH`, and `DELETE`. The production backend must generate and validate the token. The browser client must not invent or persist a privileged token itself.

## API security contract

The production API must be same-origin and HTTPS-only. The browser client is intentionally defensive:

- same-origin API base only
- HTTPS required
- relative API paths only
- path traversal and cross-origin escapes rejected
- `credentials: same-origin`
- redirects rejected
- `no-store` caching
- `no-referrer`
- JSON request/response contract
- response size limit
- HTTP method allowlist

CORS should remain disabled when the production UI and API are same-origin. If cross-origin access becomes mandatory, use an explicit origin allowlist and never reflect arbitrary `Origin` values.

## Server-side input validation

Every field must be validated again on the backend even when the browser already validates it. Validation must use positive schemas and explicit bounds.

At minimum validate:

- ISO 8601 dates/timestamps and allowed booking time ranges
- participant counts and numeric ranges
- room, service, catering, and package identifiers against authoritative catalog data
- cost-center format and allocation totals
- text lengths and allowed formats
- request identifiers and workflow transitions
- manager status-change reasons

Use parameterized database queries or an ORM that preserves parameter binding. Never construct SQL from user-controlled strings.

## Transactional room and calendar booking

The final room availability check must be performed by the trusted backend in the same logical transaction as the reservation/confirmation operation. Client-side checks are advisory only.

The backend must prevent race conditions by using an appropriate database/calendar concurrency control, for example a transaction plus a uniqueness/exclusion constraint or another atomic reservation mechanism. A second concurrent request for the same room and overlapping time must fail deterministically rather than double-booking.

External calendar calls must use fixed service endpoints and allowlisted destinations. User input must never control arbitrary outbound URLs, protecting the service against SSRF.

## Audit trail

Security-relevant and workflow-relevant actions must be recorded server-side with an immutable or tamper-evident audit trail. Events should include:

- authenticated principal
- action
- target request/resource identifier
- previous and new workflow state where applicable
- ISO 8601 timestamp
- correlation/request ID
- success/failure outcome

Do not log secrets, session cookies, CSRF tokens, or unnecessary personal data.

## Security headers

Production responses should set security headers at the HTTP layer, not rely only on HTML meta tags. At minimum assess and configure:

- Content-Security-Policy
- Strict-Transport-Security
- Referrer-Policy
- X-Content-Type-Options
- Permissions-Policy
- frame restrictions through CSP `frame-ancestors`

## Current repository controls

The repository currently provides:

- CodeQL Default Setup
- dependency review
- full-history secret scanning
- npm dependency audit
- static defensive-code checks
- deterministic Node regression/progression tests
- deterministic input-manipulation/fuzz tests
- Chromium and WebKit/iPhone Playwright regression tests
- OWASP ZAP baseline scan against the deployed Pages demo

These controls reduce client and supply-chain risk but do not replace the production backend trust boundary described above.

# Production Security Boundary

## Status

The repository contains distinct browser artifacts for the Customer application, Platform Operator application and a separate static GitHub Pages Demo launchpad. GitHub Pages is not a Customer or Platform application runtime. It publishes only `demo-portal/` and links directly to the separately hosted Render Demo origins.

The operational Customer Demo runs at `https://conference-manager-demo.onrender.com`; the operational Platform Demo runs at `https://conference-manager-ops-demo.onrender.com`. Their synthetic sessions, authorization and shared Demo persistence are Demo controls only and are not Production identity/provider/penetration acceptance evidence.

`index.html` remains the explicit Customer Demo artifact and declares:

```html
<meta name="conference-runtime" content="demo">
```

`src/core/security-policy.js` treats a missing, malformed or unknown runtime value as `production` so configuration mistakes fail closed. Demo personas are valid only for explicit Demo runtime composition.

The repository also contains the browser-side Production session trust boundary in `src/platform/production-session.js` and dedicated server-authoritative Employee and Conference Manager clients. The server-authoritative application API contract from issue #114 is complete. Those browser modules consume authority; they do not create it.

A deployable Production environment still requires the trusted same-origin backend, HTTPS/security headers, server persistence and operational controls defined by the approved topology.

## Mandatory Production architecture

```text
Customer browser
  -> same-origin HTTPS Customer API
     -> enterprise OIDC/session validation
     -> server-side Tenant resolution and RBAC/object authorization
     -> server-side business/configuration validation
     -> transactional persistence and provider/calendar services
     -> Tenant audit evidence

Platform browser (separate origin)
  -> Platform-only HTTPS API/process
     -> workforce operator identity/session/assurance
     -> Platform target-Tenant scope and deny-by-default authorization
     -> Platform audit domain
```

The browser must never be the authorization authority. Browser storage, DOM state, query parameters, role selectors and client payloads are untrusted for Tenant IDs, User IDs, roles, permissions, ownership, workflow state, provider identity, prices or configuration ownership.

## Customer authentication and session controls

Production authentication uses the enterprise identity provider. The backend validates the authenticated Principal on every protected request.

Session cookies are server-issued and require:

- `Secure`;
- `HttpOnly`;
- `SameSite=Lax` or stricter where compatible with OIDC;
- narrowly scoped `Path`;
- no unnecessary `Domain`;
- rotation after authentication/context or privilege changes where applicable;
- server-side expiry and revocation.

Long-lived bearer tokens must not be stored in LocalStorage or other JavaScript-readable browser storage.

`src/platform/production-session.js` consumes `GET /api/v1/session`, positively validates the canonical User/Tenant/role/permission/session/CSRF projection, rejects unknown or malformed authority and retains the CSRF token only in memory. The opaque session cookie remains outside JavaScript.

A malformed, expired or unavailable Production session fails to `unavailable` or unauthenticated presentation state. It never falls back to Demo fixtures, LocalStorage or browser-owned role state.

## Canonical customer role model

Roadmap Approved Version 11 (2026-09-01) is the current SaaS 3.6 customer-role and configuration-ownership baseline. It supersedes earlier SaaS 2/3 examples that grouped Catalogue or Room-business administration under Tenant Admin without changing their still-applicable topology and module-boundary decisions.

Every active Customer User has the implicit Employee baseline. Elevated roles are independent and additive:

- `conference_manager`;
- `tenant_admin`.

A dual-role User receives the exact union. `tenant_admin` does not implicitly inherit `conference_manager`, and `conference_manager` does not inherit Tenant Admin technical/integration authority.

The browser validates the session projection for presentation only. The backend remains the authorization authority.

| Capability | Employee baseline | Conference Manager | Tenant Admin |
| --- | --- | --- | --- |
| Own Request read | Yes | Yes via Employee | Yes via Employee |
| Own eligible Request cancel | Yes | Yes via Employee | Yes via Employee |
| Physical Request delete | No | No | No |
| Tenant-wide Request operations | No | `request:manage` | No |
| Room business data | No | `tenant:rooms:business:manage` | No |
| Tenant Catalogue / Room prices | No | `tenant:catalogue:manage` | No |
| Organization / booking policy / cost allocation | No | No | `tenant:configure` |
| Site and Room technical assignment | No | No | `tenant:configure` |
| Tenant Users/elevated roles | No | No | `tenant:users:manage` |
| Provider integration/mapping | No | No | `tenant:integrations:manage` |
| Tenant audit administration | No | No | `tenant:audit:read` |

Platform Admin/operator authority remains completely outside the Customer Tenant role model.

See `docs/ROLE-MODEL.md` and the backend `docs/AUTHORIZATION.md` for the synchronized matrix.

## Room, Catalogue and provider ownership

SaaS 3.6 splits Location configuration by property ownership rather than treating every Tenant setting as Tenant Admin-owned.

Conference Manager owns Room business fields such as display name, approved capacity, business active state, floor, equipment/accessibility metadata, Service/Catering applicability and local presentation assets. Tenant Catalogue—including Services, equipment catalogue entries, catering and authoritative Room prices—is also Conference Manager-owned.

Tenant Admin owns Site configuration, Room stable/technical assignment and provider integration/mapping. Microsoft/provider Room identity/resource references are never mutable Conference Manager business fields.

The frontend uses defensive ownership projections so each single-role UI preserves the other domain's fields. The backend independently classifies the submitted Location mutation against the persisted authoritative current snapshot. A mixed technical/business mutation requires both elevated capability sets. Browser classification is never trusted.

## Request-scoped current Room context

`GET /api/v1/requests/{requestId}/room-context` is a minimized, same-object-authorized presentation endpoint for a Request whose current historical Room or Site is no longer present in the active application catalogue. It applies the same Principal-derived Tenant/object read boundary as the Request detail endpoint; a browser-supplied identifier cannot expand scope, and a cross-Tenant or otherwise concealed Request does not yield context.

The response has exactly these outer fields and bounded nested projections:

```json
{
  "schemaVersion": 1,
  "requestRef": {
    "id": "REQ-42",
    "schemaVersion": 2,
    "version": 7,
    "status": "Confirmed"
  },
  "currentRoomContext": {
    "locationsRevision": 12,
    "room": {
      "id": "room-a",
      "siteId": "site-a",
      "name": "Room A",
      "capacity": 20,
      "active": false
    },
    "site": {
      "id": "site-a",
      "name": "Berlin",
      "active": false,
      "timeZone": "Europe/Berlin"
    }
  },
  "requestId": "<server-correlation-uuid>"
}
```

`currentRoomContext` is `null` when the Request has no current Room. The Room must reference the returned Site, and the Site time zone is either a validated IANA time zone or `null`. Unknown fields and malformed relationships fail closed in the browser response validator. The client may use the context Site time zone only when an actual current Room exists and that Room's `siteId` exactly matches the context Site. A missing Room, missing context or relationship mismatch yields no time-zone authority; it must not be treated as an equality between absent identifiers and must not dereference absent context.

This projection is display context only. It contains no price, provider identity, technical mapping, selectable flag, permission, policy or mutation payload authority. Employee and Conference Manager clients accept it only when the exact Request reference (`id`, schema version, version and status), Room ID and `locationsRevision` remain coherent with their already validated Request and active catalogue. A revision mismatch causes one bounded catalogue/context refresh; an unresolved mismatch, timeout, malformed response or missing authoritative IANA time zone leaves the change action unavailable rather than using browser time or stale data.

Only active Rooms under active Sites from the active application catalogue are selectable for a confirmed-booking change. An inactive current Room/Site may be rendered as the disabled historical selection, but it is never merged into the active catalogue and cannot be retained even for an otherwise participant-only change. The User must choose a currently active Room, and the backend revalidates configuration and availability independently.

The change submission uses the version of the validated Request actually displayed to the User as `expectedVersion`. A preflight read must not silently replace that token while the proposed draft is still based on older displayed state. The backend rejects stale versions and remains authoritative for concurrency, authorization, workflow, price, policy and audit outcomes.

## Production activation boundary

A valid Production session never activates Demo business views. The server-authoritative application API contract from issue #114 is complete. Production composition uses dedicated Employee and Conference Manager implementations backed only by `src/platform/production-persistence.js`; the demo implementations and LocalStorage path remain isolated to explicit Demo runtime composition.

This means:

- unauthenticated Production renders only sign-in state;
- unavailable/unverifiable session renders fail-closed recovery state;
- authenticated Production may render the dedicated Employee application from the same-origin server API;
- Conference Manager presentation requires validated Conference Manager capability and receives operational plus Room-business/Catalogue administration;
- Tenant Admin presentation requires the relevant validated Tenant Admin permissions and receives technical/Tenant administration only;
- dual-role presentation is the union, not a fourth authorization role;
- Demo persona switching cannot appear in Production composition.

## Inactivity lock

SaaS 3.6 adds an additive browser confidentiality control for authenticated Customer application sessions.

Production locks the rendered Customer application after 15 minutes without qualifying user activity. Demo uses five minutes for deterministic acceptance. Locking:

- clears rendered application content and primary navigation;
- removes the Demo context selector where applicable;
- does not store credentials, session material or role state;
- can propagate only a `lock` event across tabs;
- evaluates elapsed time on visibility/BFCache return;
- requires a fresh authoritative session `bootstrap()` before content can return.

An expired, revoked or `security_version`-stale session therefore cannot be restored by browser unlock state. The inactivity lock is defense in depth only; it does not replace server expiry, revocation, role-change invalidation, CSRF or per-request authorization.

## Platform Operator separation

Platform access uses a dedicated operator origin, fixed workforce identity registration, pre-provisioned server-side operator identity, enterprise MFA/Conditional Access, separate opaque session and OIDC transaction cookies, separate CSRF/session secrets and a Platform-only backend process.

Employee, Conference Manager, Tenant Admin, Customer identities/cookies/browser claims/provider groups can never create or upgrade into Platform authority. Platform authorization uses a separate deny-by-default policy, target-Tenant scopes, assurance/step-up rules and a separate integrity-protected audit domain.

Tenant Admin and the Customer API/database runtime cannot read Platform events or consume Platform sessions. Assigning Customer roles never changes Platform operator identity or scope.

## Authorization and BOLA/IDOR controls

Authorization is enforced server-side for every request and object reference.

Required controls include:

- owning-Employee checks for self-service Request operations;
- explicit Conference Manager checks for Tenant-wide Request operations and business configuration;
- explicit Tenant Admin checks for technical/Tenant administration;
- exact dual-role union when both elevated roles are present;
- deny-by-default handling for unknown roles/permissions;
- server-derived Tenant/User/role/permission scope;
- Tenant-scoped persistence queries and concealment/denial for cross-Tenant objects;
- no trust in client-supplied status, ownership, provider identity, configuration class or prices.

## CSRF

Cookie-authenticated state-changing requests use CSRF protection in addition to SameSite cookies.

`src/core/api-client.js` requires an in-memory CSRF token for `POST`, `PUT`, `PATCH` and `DELETE`. Production backend/session endpoints generate/validate that token. It is not persisted in LocalStorage/sessionStorage and is not authorization by itself.

## API transport security

The Customer Production API is same-origin and HTTPS-only. Browser transport is defensive:

- same-origin API base;
- HTTPS required;
- relative API paths only;
- path traversal/cross-origin escape rejected;
- `credentials: same-origin`;
- redirects rejected;
- `no-store` caching;
- `no-referrer`;
- JSON contract with response size bounds;
- HTTP method allowlist;
- bounded/minimized non-success error envelopes.

CORS should remain disabled for the normal same-origin path. The Platform application follows the same-origin principle independently at its own origin; Customer and Platform origins must not route each other's privileged APIs.

The static GitHub Pages Demo launchpad does not call either API and therefore creates no CORS/session bridge between the Render origins.

## Server-side input validation

Every field is validated again on the backend using positive exact schemas and explicit bounds. At minimum this covers timestamps, participants, Room/Service/Catering identifiers, cost allocation, text lengths, Request/workflow identifiers, configuration revision contracts and manager decision reasons.

Parameterized persistence is mandatory. User input must not construct SQL or arbitrary server outbound URLs.

## Receipt-bound Tenant bulk transfer

Bulk transfer is aggregate-specific and does not create a generic Tenant configuration permission. Conference Manager presentation exposes only the injected Room-business (`rooms`) and Catalogue (`services`, `catering-items`, `catering-packages`) aggregates. Tenant Admin presentation exposes only the injected technical Locations (`sites`, `rooms`) and Cost Allocation (`cost-centers`) aggregates. The trusted API still derives the Principal/Tenant, classifies Room properties, enforces each aggregate's exact permission and revision, and verifies the validation receipt on Apply.

The shared browser panel is presentation, not authorization. Apply is bound to the exact type, selected file, parsed document and server receipt returned by the latest successful validation. A type/file change or newer validation invalidates earlier results; validation is disabled while Apply is pending. Downloads, announcements and rerenders are suppressed after navigation, DOM detachment or inactivity lock so a stale asynchronous completion cannot restore or export data in a later view.

Template/export JSON uses a narrowly scoped Object URL created only from the already serialized in-memory document. That URL is assigned directly to a temporary download anchor and revoked after activation. This does not weaken the generic navigation sanitizer or authorize arbitrary `blob:` navigation.

## Transactional Room/calendar booking

The final Room availability check is performed by the trusted backend in the same logical transaction/authority flow as reservation/confirmation. Browser checks remain advisory.

Before the Production Employee UI submits, it also requires the same-origin availability endpoint to validate the exact Room/time tuple using the Room Site's authoritative IANA time zone. The browser time zone and implicit UTC are forbidden fallbacks. A changed room/window, occupied result or unavailable provider keeps submission disabled and still does not replace the final backend concurrency control.

The backend prevents double booking with transactional locking/constraints and revalidates Request/configuration/provider authority at commit-sensitive boundaries.

Confirmed-booking changes remain server-authoritative. The browser cannot reserve/approve another User's target state, inject authoritative prices/policy/allocation results or report provider success.

## Audit trail

Security- and workflow-relevant actions are recorded server-side with tamper-evident/append-only evidence as defined by the backend. Actor, Tenant, action, target, previous/new state where applicable, time, correlation and outcome are server-derived.

Secrets, session cookies and CSRF tokens are never audit payloads.

Customer/Tenant audit and Platform audit remain separate authorization/integrity domains. Required audit failure rolls back the privileged mutation where the architecture defines atomic evidence.

## Security headers

Production responses configure security headers at the HTTP edge, not only HTML meta tags. The baseline includes assessment/configuration of CSP, HSTS, Referrer-Policy, X-Content-Type-Options, Permissions-Policy and CSP `frame-ancestors`.

## Current repository controls

The repository currently provides the following controls and executable workflows; their presence is not evidence that a particular commit, deployment or external environment passed them:

- dependency review and npm audit;
- full-history/repository secret scanning;
- static SAST-style defensive checks;
- architecture/module-boundary gates;
- deterministic Node regression/progression tests;
- canonical role/permission session validation, including dual role;
- Room technical/business ownership projection tests;
- malformed input and unknown-field negative tests;
- deterministic inactivity-policy tests;
- Chromium and WebKit/iPhone browser suites;
- PostgreSQL-backed shared-Demo cross-surface E2E designed to run against explicit immutable frontend/API refs;
- a hosted Render Demo acceptance workflow that requires deployment identity, destructive-journey and cleanup/reset evidence;
- an independent OWASP ZAP passive-baseline workflow matrix for the static GitHub Pages launchpad,
  Customer Render Demo origin and Platform Render Demo origin.

Each clean scan is evidence only for its exact unauthenticated public Demo surface. The three-target
matrix is not authenticated API/authorization DAST, Production penetration evidence or permission
to infer one origin's posture from another. Production acceptance must target the applicable
Production application/API origin and identity context independently.

Exact-head CI, hosted acceptance and DAST results are recorded separately in the hardening register
and GitHub checks. A historical successful run cannot be carried forward to a changed frontend/API
pair, and repository maintainers must not infer external acceptance from a workflow definition.

These controls reduce client/supply-chain/regression risk but do not replace the Production trust boundary or external provider/penetration acceptance.

## Required regression focus

Changes to customer authorization/session/configuration require re-proof of:

- implicit Employee baseline and no Request deletion;
- independent Conference Manager and Tenant Admin capabilities;
- exact dual-role union;
- cross-Tenant/BOLA denial;
- CSRF;
- role-change session invalidation;
- Room business versus technical/provider property ownership;
- Catalogue/Room-price Conference Manager ownership;
- malformed/unknown-field fail-close behavior;
- inactivity lock and authoritative unlock revalidation;
- Demo/Production import/topology separation;
- Customer/Platform origin/session/database-role separation.

See `docs/SAAS-3.6-SECURITY-REGRESSION.md` for the finding classification and evidence matrix.

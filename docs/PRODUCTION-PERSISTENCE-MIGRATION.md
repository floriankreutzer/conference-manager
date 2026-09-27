# Demo to Production Persistence Migration

## Authority

Root `AGENTS.md`, `docs/CODING-STANDARDS.md`, `docs/ARCHITECTURE.md` and `docs/PRODUCTION-SECURITY.md` remain authoritative. This document defines the SaaS 0 persistence migration boundary for issue #56 and records how ADR-010 supersedes its former browser-authoritative Demo compatibility path.

## Runtime modes

Conference Manager has explicit Production and Demo compositions. Both use server authority; their runtime configuration, credentials and data remain isolated.

### Demo

`<meta name="conference-runtime" content="demo">` selects the Customer Demo composition. The Customer Demo obtains a server-issued Tenant/User/persona session and calls the Customer Demo API on its own origin. The Platform Admin Demo uses a separate entry point, origin, Platform Demo session and `/api/v1/platform/*` boundary.

Both Demo processes use one isolated PostgreSQL data model with separate least-privilege runtime roles. LocalStorage/sessionStorage is not authoritative for Demo identity, Tenant, persona, permission, Request, catalogue, settings, booking, pricing, fleet, lifecycle, entitlement, provider or audit state. Only explicitly bounded preferences such as language, navigation convenience and an untrusted draft may remain browser-local.

Historical note: issue #56 originally retained a LocalStorage-compatible static MVP in explicit Demo mode. ADR-010 superseded that model for active Customer and Platform Demo business state. Historical browser data is not silently uploaded into the shared Demo database.

### Production

Any missing, malformed or non-`demo` runtime value is treated as `production` by `src/core/security-policy.js`.

In production:

- authoritative profile, role, Request, catalogue, Room/Site context, notification and configuration data must come from the trusted same-origin API;
- the browser must not read or write the corresponding LocalStorage keys;
- production API failures fail closed and are never converted into LocalStorage success;
- stale or manipulated browser data cannot override server state;
- server responses use explicit versioned envelopes and are validated at the browser API boundary;
- cookie-authenticated writes continue to require the existing CSRF contract in `src/core/api-client.js`.

Local-only UI preferences may remain in browser storage when they do not establish business authority. The current examples are language selection and an explicitly bounded Employee draft. A draft is untrusted convenience data and must be revalidated against current authoritative server state before any Demo or Production submission.

## Production repository/API contracts

`src/platform/production-persistence.js` defines the browser-side production repository contract. It uses only relative same-origin API paths and never imports `src/core/storage.js`.

Current contract paths are:

| Domain | API contract | Authority |
| --- | --- | --- |
| Profile | `GET/PUT /api/v1/application/profile` | authenticated User/Tenant backend state |
| Catalog | `GET /api/v1/application/catalog` | Tenant-scoped backend catalog |
| Requests | `GET/POST /api/v1/application/requests` | authorized backend Request use cases |
| Request detail/history | `GET /api/v1/requests/{id}` and `/history` | server-scoped Request and persisted action-attribution snapshots |
| Request Room context | `GET /api/v1/requests/{id}/room-context` | minimized current Room/Site projection; optional confirmed-Request Guest Presentation |
| Request report | `GET /api/v1/application/reports/requests` | bounded Tenant-wide Manager report projection |
| Room availability | `POST /api/v1/application/room-availability` | Tenant-scoped local conflict and Microsoft Free/Busy use case |
| Request transition | `POST /api/v1/requests/{id}/transitions` | existing server workflow policy |
| Confirmed booking change | `GET/POST /api/v1/requests/{id}/booking-change` | owner/manager proposal policy and single-open invariant |
| Booking change decision | `POST /api/v1/requests/{id}/booking-change/{changeId}/decision` | Conference Manager approval with server revalidation |
| Notifications | `GET /api/v1/application/notifications` | authenticated User/Tenant backend state |
| Notification read state | `PATCH /api/v1/application/notifications/{id}` | authenticated User ownership |
| Configuration | `GET/PUT /api/v1/application/configuration` | explicitly authorized Tenant configuration |

These paths are transport contracts. Backend implementations must continue to derive Tenant, User, roles, permissions, ownership, prices, statuses and audit context server-side. Browser fields with those names are never authoritative.

There is no `/api/v1/application/site-info` bootstrap contract. Employee Guest/print surfaces obtain
only the minimized Guest Presentation through the authorized Request Room-context endpoint;
operational time zones come from the validated catalogue/current-Room context. Missing context fails
visibly and never selects a browser fixture or an unminimized Site object.

The production Employee client converts a selected room/date/time window only with the authoritative IANA time zone returned on that room's `catalog.sites[]` entry. It never uses the browser time zone or silently assumes UTC. A missing or invalid site time zone blocks availability verification and request submission. Every room or time change invalidates the prior availability result; submission remains disabled until the backend verifies the exact current `{ roomId, startsAt, endsAt }` tuple. This browser check is a prerequisite for the production UI, but the server's final confirmation check remains the booking authority.

For a confirmed booking, the Employee and Conference Manager production clients render the server's open proposal when one exists; otherwise they may render the latest terminal change that matches the current Request. A prior terminal change never prevents creating a new proposal. The browser sends only the desired room, UTC window and participant counts. It cannot set proposal state, initiator, decision actor, Tenant, Request owner or provider references. The Manager UI exposes approve/reject only and renders server-derived alternatives when approval is blocked. The original booking remains presented as active until the server returns a successfully applied Request.

## Versioned data boundary

Production responses use explicit domain-specific versioned envelopes. Profile, notification and
configuration contracts retain their schema-v1 envelopes; the application Catalogue uses schema 2.
Attribution-enabled public Request list/detail/history/report and booking-change responses use outer
`schemaVersion: 3`. Their nested Request composition independently accepts schema 1, 2 or 3 as
defined by the Request wire contract. The frontend compatibility validator can still read the
frozen schema-v2 Request envelope without attribution, but it never fabricates attribution and
rejects v3 fields on v2. Unknown versions and shapes fail closed with the domain-specific production
error.

For Catalogue and Request list/write responses, the browser adapter enforces the exact minimized shapes emitted by the backend application service. Every required field is type- and range-checked; unknown fields, duplicate collection IDs, invalid catalogue references, unsupported Request states and semantically invalid status reasons fail closed. The adapter does not retain or infer Tenant IDs, requester IDs, ownership or replacement Room references. It does retain only the persisted display snapshots required by the v3 contract: `requesterAttribution`, history `actorAttribution`, and booking-change `initiatorAttribution`/`deciderAttribution`. `roleAtAction` is limited to `employee`, `conference_manager` or an honest legacy `null`; current Principal/profile data is never a fallback. Public price, attribution and workflow fields remain presentation data and never become browser authority.

Historical browser Demo objects are not declared wire-compatible merely because they contain similarly named fields. Production and Demo payload schemas must be evolved deliberately and versioned when a breaking semantic or shape change is required.

This avoids two unsafe migrations:

1. uploading arbitrary legacy LocalStorage JSON and treating it as trusted database state;
2. making PostgreSQL mirror browser-specific presentation/cache structures.

## Migration of existing historical Demo data

There is no automatic browser-to-Demo or browser-to-Production upload.

If pilot users require selected demo data to be retained, migration must be a separately reviewed administrative import with:

- explicit Tenant destination;
- positive schema validation;
- server-side ownership mapping;
- catalog/reference reconciliation;
- workflow/status validation;
- duplicate/idempotency handling;
- audit evidence;
- rejection/reporting of records that cannot be mapped safely.

Production startup never imports LocalStorage implicitly.

## Write semantics

A production write succeeds only after the same-origin API returns a valid successful response. Network errors, non-success HTTP responses, malformed responses and unsupported schema versions remain failures.

There is no write-through cache and no fallback to `requestRepository`, catalog LocalStorage, notification LocalStorage or profile LocalStorage.

The Customer and Platform Demo compositions use server-backed session/API adapters and canonical backend application services. The historical `src/core/storage.js` browser repository and its parallel catalogue/data helpers are removed. Architecture gates reject their reintroduction, Demo business-state storage, browser role/persona authority and API-failure fallback.

## Rollback

Frontend rollback does not copy production server state into LocalStorage.

- Rolling a production deployment back to an earlier production client continues to use server authority only if that client supports the active API schema.
- API schema-breaking changes require a compatibility window or explicit coordinated deployment.
- Returning to explicit `demo` starts the server-backed Customer Demo. It never restores or imports historical browser business state.
- Production database rollback remains governed by `conference-manager-api` migration policy and must never be emulated by browser storage.

## Security properties

The migration boundary directly addresses:

- Broken Access Control / BOLA / IDOR: browser tenant/role/object state cannot establish authority;
- CSRF: production writes continue through the same-origin API client CSRF contract;
- XSS/data poisoning: API responses remain untrusted input and require shape validation before use;
- replay/stale state: authoritative mutations are server operations; stale browser snapshots cannot overwrite production state through LocalStorage;
- information disclosure: production repository errors expose stable client codes rather than backend payloads;
- insecure fallback: production API failure cannot activate demo persistence.

## Required evidence

Changes to this boundary require:

- regression tests for server-backed Customer and Platform Demo behavior;
- negative architecture tests rejecting LocalStorage business/persona/permission authority and API-failure fallback;
- reset/seed, cross-session propagation and cross-Tenant isolation tests against the isolated Demo PostgreSQL database;
- production no-fallback tests;
- stale/manipulated browser data tests;
- API response-version/shape negative tests;
- architecture checks preventing production adapters from importing browser persistence;
- `npm run check` and `npm run audit`;
- browser E2E when observable demo behavior changes.

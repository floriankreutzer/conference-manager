# Demo to Production Persistence Migration

## Authority

Root `AGENTS.md`, `docs/CODING-STANDARDS.md`, `docs/ARCHITECTURE.md` and `docs/PRODUCTION-SECURITY.md` remain authoritative. This document defines the SaaS 0 persistence migration boundary for issue #56.

## Runtime modes

Conference Manager has two explicit persistence modes.

### Demo

`<meta name="conference-runtime" content="demo">` keeps the current GitHub Pages/local-demo behavior. Existing LocalStorage keys, serialization formats and backward compatibility remain supported for the demo runtime.

Demo LocalStorage is convenience persistence only. It is never a production authorization, identity, tenant, booking or pricing authority.

### Production

Any missing, malformed or non-`demo` runtime value is treated as `production` by `src/core/security-policy.js`.

In production:

- authoritative profile, role, Request, catalog, site, notification and configuration data must come from the trusted same-origin API;
- the browser must not read or write the corresponding LocalStorage keys;
- production API failures fail closed and are never converted into LocalStorage success;
- stale or manipulated browser data cannot override server state;
- server responses use explicit versioned envelopes and are validated at the browser API boundary;
- cookie-authenticated writes continue to require the existing CSRF contract in `src/core/api-client.js`.

Local-only UI preferences may remain in browser storage when they do not establish business authority. The current examples are language selection and an Employee draft. A draft is untrusted convenience data and must be revalidated against current authoritative server state before any production submission.

## Production repository/API contracts

`src/platform/production-persistence.js` defines the browser-side production repository contract. It uses only relative same-origin API paths and never imports `src/core/storage.js`.

Current contract paths are:

| Domain | API contract | Authority |
| --- | --- | --- |
| Profile | `GET/PUT /api/v1/application/profile` | authenticated User/Tenant backend state |
| Catalog | `GET /api/v1/application/catalog` | Tenant-scoped backend catalog |
| Site information | `GET /api/v1/application/site-info` | Tenant-scoped backend configuration |
| Requests | `GET/POST /api/v1/application/requests` | authorized backend Request use cases |
| Request transition | `POST /api/v1/requests/{id}/transitions` | existing server workflow policy |
| Notifications | `GET /api/v1/application/notifications` | authenticated User/Tenant backend state |
| Notification read state | `PATCH /api/v1/application/notifications/{id}` | authenticated User ownership |
| Configuration | `GET/PUT /api/v1/application/configuration` | explicitly authorized Tenant configuration |

These paths are transport contracts. Backend implementations must continue to derive Tenant, User, roles, permissions, ownership, prices, statuses and audit context server-side. Browser fields with those names are never authoritative.

## Versioned data boundary

Production application-domain responses use an envelope with `schemaVersion: 1` plus exactly the requested domain payload. Unknown versions fail closed with `PRODUCTION_SCHEMA_VERSION_UNSUPPORTED`.

The current demo objects are not declared wire-compatible merely because they contain similarly named fields. Production payload schemas must be evolved deliberately and versioned when a breaking semantic or shape change is required.

This avoids two unsafe migrations:

1. uploading arbitrary legacy LocalStorage JSON and treating it as trusted database state;
2. making PostgreSQL mirror browser-specific presentation/cache structures.

## Migration of existing demo data

There is no automatic browser-to-production upload.

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

The existing demo capability code still uses synchronous demo repositories. `src/core/storage.js` now blocks those authoritative repositories when the runtime is production. Therefore an accidentally un-migrated capability path fails closed instead of silently mutating browser state and displaying false success.

Capability-by-capability production activation must replace synchronous demo mutation calls with the production repository/use-case commands before that capability is enabled in a production deployment. The secure boundary is established first; unsupported mutation paths fail rather than downgrade authority.

## Rollback

Frontend rollback does not copy production server state into LocalStorage.

- Rolling a production deployment back to an earlier production client continues to use server authority only if that client supports the active API schema.
- API schema-breaking changes require a compatibility window or explicit coordinated deployment.
- Returning to the explicit `demo` runtime restores the historical demo LocalStorage behavior only for demo data already present in that browser.
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

- regression tests for existing demo LocalStorage behavior;
- production no-fallback tests;
- stale/manipulated browser data tests;
- API response-version/shape negative tests;
- architecture checks preventing production adapters from importing browser persistence;
- `npm run check` and `npm run audit`;
- browser E2E when observable demo behavior changes.

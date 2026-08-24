# Demo to Production Persistence Migration

## Authority and scope

Root `AGENTS.md`, `docs/CODING-STANDARDS.md`, `docs/ARCHITECTURE.md` and `docs/SAAS-PRODUCTION-TOPOLOGY.md` are authoritative. This document defines the SaaS 0 issue #56 migration boundary between the explicit browser demo and production API persistence.

This is a trust-boundary migration, not a bulk copy of LocalStorage into production. Browser data is untrusted and never becomes Tenant, identity, role, workflow, pricing or booking authority merely because it has the same shape as demo data.

## Runtime modes

Two persistence modes exist:

- `demo`: existing LocalStorage/sessionStorage compatibility for GitHub Pages and local demonstration use;
- `production`: same-origin API repositories only.

`normalizeRuntimeMode` remains fail-closed: only the literal `demo` value selects demo behavior. Missing, malformed or unknown runtime mode resolves to production behavior.

`src/platform/persistence-runtime.js` is the composition boundary. It selects either the demo repository set or `src/core/production-persistence.js`. It contains no API-error fallback to demo persistence.

## Browser-storage authority

The following existing keys remain compatible in demo mode but are forbidden as production data sources or write targets:

| Existing demo key | Production authority |
| --- | --- |
| `conference_requests` | trusted API/database Request repositories |
| `conference_catalog_v2` | trusted Tenant catalog/configuration API |
| `conference_site_info_v1` | trusted Tenant configuration API |
| `conference_notifications_v1` | trusted server notification API |
| `conference_user_profile_v1` | trusted identity/profile API |
| `conference_demo_role_v1` | never authoritative; production roles come from the server session |

`src/core/storage.js` throws `ProductionStorageAccessError` before accessing the five JSON authority keys when the runtime is production. This error is deliberately raised outside the defensive demo parsing/writing `try/catch` blocks so it cannot be converted into a fallback value.

Two browser-local values remain intentionally local because they do not establish server authority:

- language preference;
- request draft UI state.

A production draft is still untrusted input. Submission must be revalidated by the backend and may not carry Tenant, requester, role, permission or workflow authority.

## Production API repository contract

`src/core/production-persistence.js` defines same-origin API adapters for:

- Requests: `v1/requests` plus object and transition routes;
- Catalog: `v1/catalog`;
- Profile: `v1/profile`;
- Notifications: `v1/notifications`;
- Tenant configuration: `v1/configuration`.

The browser API client remains `src/core/api-client.js`, including same-origin HTTPS, secure-cookie credentials, CSRF for unsafe methods, redirect rejection and bounded JSON responses.

### Request semantics

Requests use semantic operations instead of browser-controlled whole-list replacement:

- list Requests;
- get one Request;
- create from a command payload;
- update editable Request data through the API;
- execute a server-defined transition.

Create/update commands reject client authority fields such as Tenant ID, requester User ID, status, roles, permissions and owner. Status transitions are sent only as transition intent and remain server-authorized.

Existing Request status/history meaning is unchanged by #56. Production API responses are validated before becoming presentation state. Tenant IDs are not accepted in the public Request representation.

### Versioned resource shapes

Catalog, profile, notifications and Tenant configuration use `schemaVersion: 1` envelopes. Unknown versions fail closed with `PRODUCTION_SCHEMA_VERSION_UNSUPPORTED`; there is no silent client-side shape migration in production.

The `/api/v1` Request contract remains the Request domain/API version boundary. Future breaking Request-shape changes require coordinated API-version compatibility or an explicit new version; they must not be inferred from stale browser data.

## Demo compatibility

The existing LocalStorage keys, defensive parsing, storage limits, Request objects, catalog/site migration helpers and demo repository behavior remain unchanged in demo mode. Existing demo data is not automatically deleted or rewritten by enabling production mode.

The identity bootstrap seeds the demonstration profile only when the runtime is explicitly `demo`. In production it does not read, clear, seed or otherwise consult LocalStorage profile state.

## No-fallback behavior

Production API failure is an application/service failure, not permission to consult LocalStorage.

Required behavior:

1. production repository calls the trusted same-origin API;
2. transport, HTTP, validation or schema-version failure propagates as failure;
3. no stale LocalStorage value is read;
4. no success UI may be based on an uncommitted browser value;
5. retry/recovery stays within the API/server persistence contract.

Production writes may update an in-memory presentation cache only after the authoritative API reports success. A caller must not optimistically report persistence success before that response.

## Rollout sequence

Production rollout must be coordinated, not inferred from the demo artifact:

1. Deploy compatible backend endpoints and database migrations first.
2. Validate Tenant isolation, authorization, CSRF, positive schemas, persistence transactions and API contract tests.
3. Populate required server-side Tenant/catalog/configuration data through reviewed server-side onboarding/migration tooling.
4. Deploy a production frontend configuration with `conference-runtime=production`, same-origin `/api/*` routing and a production CSP that permits only the required same-origin API connection.
5. Verify production API repositories against the deployed non-production environment.
6. Only then expose the production runtime to Pilot users.

The checked-in `index.html` remains the explicit demo artifact and therefore keeps `conference-runtime=demo` and `connect-src 'none'`.

## Data migration policy

There is intentionally no automatic browser-to-production upload of existing demo data.

If a customer later requires importing a demo dataset, that is a separate controlled import feature. It must:

- run through a trusted server/operator boundary;
- identify the target internal Tenant explicitly on the server side;
- validate and transform data using a documented import schema/version;
- reject browser role/Tenant/status/audit authority;
- produce audit evidence;
- support dry-run/error reporting and deterministic rollback or compensating action.

## Rollback

Frontend rollback means deploying an earlier production frontend version that remains compatible with the current backend API. It never means re-enabling LocalStorage authority.

Backend/database rollback follows `conference-manager-api` migration rules. If a backend migration cannot safely roll back populated data, deployment must roll forward or use a reviewed recovery procedure rather than silently discarding authoritative data.

If the production API is unavailable during rollback or deployment, the production application remains unavailable/degraded as appropriate. It must not switch to the demo repository.

Demo rollback is independent because demo data remains browser-local and is not a production source of truth.

## Security mapping

- Broken Access Control / BOLA / IDOR (CWE-639/CWE-862): Tenant and object authority remain backend-only; production adapters do not accept browser Tenant authority.
- CSRF (CWE-352): unsafe API operations continue through the existing CSRF-aware same-origin client.
- XSS / stored data: API responses are untrusted and structurally validated before presentation; UI rendering remains subject to safe DOM rules.
- Injection: production persistence uses API commands, never direct browser database access.
- Information disclosure: public Request normalization rejects Tenant IDs; production storage does not expose server credentials or session IDs.
- Insecure fallback / confused deputy: authoritative LocalStorage access is blocked in production and API errors cannot select demo persistence.
- Replay/workflow manipulation: Request transitions remain server-defined and server-authorized.

## Verification

#56 requires evidence for:

- unchanged demo storage regression behavior;
- explicit demo/production repository selection;
- API adapter paths and unsafe-method behavior through `api-client`;
- command authority-field rejection;
- production response/schema validation;
- API/offline failure propagation;
- stale LocalStorage manipulation not being consulted in production;
- authoritative browser-key reads/writes failing closed in production;
- production identity bootstrap not consulting LocalStorage;
- architecture gate enforcement against production browser-storage dependencies.

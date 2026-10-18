# Production Persistence Contract

Issue #56 established the secure browser-side migration boundary from the former static Demo to trusted SaaS persistence. ADR-010 subsequently superseded the LocalStorage-authoritative Demo side of that historical boundary.

The normative migration and rollback rules are documented in `PRODUCTION-PERSISTENCE-MIGRATION.md`.

Key invariants:

- explicit `demo` selects the Customer Demo composition and its separate server-issued Demo session/API boundary;
- missing/unknown runtime mode is production and fails closed;
- profile, role, Requests, catalog, site data, notifications, configuration, Tenant/fleet state and effective permissions cannot use LocalStorage as Production or Demo authority;
- production repositories use only the same-origin API client and versioned response envelopes;
- catalog and Request responses are accepted only in their minimized backend wire shape: required fields and types are validated, unknown fields and duplicate IDs fail closed, catalog room/site references must resolve, and no Tenant/User authority fields are retained;
- production room availability uses the same-origin backend and an authoritative catalog site IANA time zone; missing zones fail closed;
- changing the selected room or UTC window invalidates the browser's prior availability result before request submission;
- API/network/session/schema failures never fall back to browser persistence, fixtures or browser mutation rules;
- language and explicitly bounded untrusted local drafts may remain local convenience state;
- Customer and Platform Demo business state is persisted in one isolated PostgreSQL database while their sessions, cookies, CSRF keys, origins, API processes and runtime database roles remain separate;
- persona selection is server-resolved and cannot mint effective roles or permissions in the browser;
- existing demo data is never automatically uploaded into a production Tenant;
- any future legacy-data import is a separately audited server-side migration process.

## Request start and explicit discard

The shared Employee renderer records the first material edit of a new Request through fixed
same-origin `POST /api/v1/application/request-workflows`. The body is exactly `{}`; the existing API
client supplies the session-bound CSRF token and a UUID `Idempotency-Key`. Repeated starts use the
same key. Responses are positively validated as an exact schema-version-1 workflow envelope with a
UUID, allowlisted state and canonical server timestamps. No draft content, client clock, Tenant,
owner, permission or authoritative workflow state is submitted by this route.

The existing single 32 KiB session draft key uses envelope v5 and may retain only the opaque
`idempotencyKey` and nullable `workflowId` beside its existing allowlisted editor fields. Both are
untrusted locators, scoped to the exact authenticated Tenant/User/session expiry and reauthorized
server-side. V4 remains readable with an unknown start reference. A late transport response updates
the reference only if the stored key still matches; it cannot replace a newer draft's content.

New Request submission passes optional `workflowId` beside its existing composition envelope. The
backend owns its binding to the Request UUID, normalized payload fingerprint, immutable first
revision and atomic audit. Identical submission retries return that first revision; different
payloads and terminal abandoned workflows conflict. Owner resubmission uses its existing separate
contract and does not create a first-submission start.

Only confirmed **Discard draft** invokes fixed
`POST /api/v1/application/request-workflows/{workflowId}/abandon` with `{}`. Cancelling the dialog,
switching views, reloading, closing a tab and local draft expiry do not emit abandonment. An untouched
draft has no lifecycle event. Local input is cleared only after the server transition succeeds, or
after the same-key server readback confirms that exact workflow was already submitted following a
lost response. That recovery preserves the committed Request and creates no abandonment. Session or
authority failures retain the existing fail-closed editor invalidation; no browser fallback is used.

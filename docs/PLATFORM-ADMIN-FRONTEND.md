# Platform Admin frontend

This document describes the browser implementation for the SaaS 3 Platform Control Plane. The accepted trust boundary and deployment topology remain authoritative in
[`SAAS3-PLATFORM-CONTROL-PLANE.md`](./SAAS3-PLATFORM-CONTROL-PLANE.md).

## Runtime separation

The Platform Admin browser is a separate artifact from the customer application and Tenant Admin:

| Runtime | Entrypoint | Composition root | Data authority |
| --- | --- | --- | --- |
| Production | `platform-admin/index.html` | `src/platform-admin/production/bootstrap.js` | Same-origin `/api/v1/platform/*` only |
| Isolated Demo | `platform-admin-demo/index.html` | `src/platform-admin/demo/bootstrap.js` | Synthetic local Demo adapter only |

Shared presentation, routing, localization, and defensive response contracts live in `src/platform-admin/`. Production and Demo adapters may import that shared code, but neither runtime may import the other adapter. The customer `src/app.js`, `src/platform/`, customer capability modules, and Tenant Admin do not import Platform Admin code or receive Platform authority.

The Production composition root never imports fixtures, reads browser storage as authority, or falls back to Demo when a session or response is unavailable. Its Content Security Policy limits connections to the operator origin. The Demo Content Security Policy uses `connect-src 'none'`.

## Production session and step-up

Production consumes the direct, exact `GET /api/v1/platform/session` projection:

```text
operatorId, roles, permissions, assurance, expiresAt, stepUpExpiresAt, csrfToken
```

Unknown keys, roles, permissions, role/permission combinations, assurance values, expired sessions, or malformed timestamps invalidate the whole projection. The CSRF token remains in memory and the opaque session cookie remains `HttpOnly`.

The browser uses these fixed authentication routes:

- sign in: `GET /api/v1/platform/auth/microsoft/login`;
- step-up: `GET /api/v1/platform/auth/microsoft/step-up`;
- sign out: `DELETE /api/v1/platform/session`.

When a permitted high-impact operation lacks current step-up assurance, the UI offers only the fixed step-up route. It sends no action, Tenant, reason, query, body, or caller-selected resume URL and stores no pending operation. The fixed callback returns to the Platform root, the browser reloads the rotated session, and the operator must select and confirm the complete operation again.

All `manage`, `execute`, `sensitive`, `export`, `revoke`, operator-administration, and break-glass permissions require step-up presentation gating. This client-side gating is not authorization: the API independently enforces the permission, current assurance, server-owned target scope, aggregate revision, transition policy, and audit transaction.

## Production directory and mutations

The initial Production adapter supports the #129 service-owned surface:

- `GET /api/v1/platform/tenants?limit=&cursor=&lifecycleStatus=&search=`;
- `DELETE /api/v1/platform/tenants/:tenantId/invitations/:invitationId`;
- `POST /api/v1/platform/tenants/:tenantId/invitations/:invitationId/reissue`;
- `POST /api/v1/platform/tenants/:tenantId/lifecycle/transitions`.

The directory keeps lifecycle and invitation revisions separate. Invitation mutations always use `invitation.revision`; lifecycle mutations always use `lifecycle.revision`. The browser never substitutes one aggregate revision for the other and does not invent a `current` invitation or per-target lifecycle alias.

Every mutation supplies a caller-generated UUID in `Idempotency-Key`, a bounded reason, and exact backend operation/Tenant confirmation. Correlation and authoritative audit evidence are server-generated. UI action lists are presentation hints derived from minimized server state and never grant authority.

Reissue responses may contain a one-time delivery value. The application displays it only in the immediate result dialog, does not persist or log it, and removes it from the DOM when the dialog closes.

Readiness, entitlement, integration-health, diagnostics, Platform-audit, recovery, metering, and runtime sections already have bounded presentation and Demo contracts. Until their service owners expose approved Production routes, Production shows an explicit unavailable state and does not fabricate values, call aliases, or load Demo data.

## Frontend ownership and checks

- `src/platform-admin/contracts.js`: exact role, permission, assurance, directory, mutation, and Demo view-model validation.
- `src/platform-admin/application.js` and `tenant-sections.js`: accessible shell, directory, detail sections, confirmations, and transient delivery result.
- `src/platform-admin/production/`: Production session and API adapters plus composition root.
- `src/platform-admin/demo/`: isolated fixtures, role simulation, storage, reset, and composition root.
- `src/core/i18n-platform-admin-messages.js`: canonical German and English messages.
- `assets/platform-admin.css`: Platform Admin presentation using repository design tokens.
- `scripts/check-platform-admin-boundaries.mjs`: topology, import, storage, network, CSP, and composition-root gate.

Run `npm run check`, `npm run audit`, and `npm run test:e2e`. The E2E suite verifies the isolated Demo, deterministic reset, role/assurance presentation, Production fail-closed behavior, and the fixed step-up request.

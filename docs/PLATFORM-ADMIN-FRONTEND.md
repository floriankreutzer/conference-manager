# Platform Admin frontend

## Private hosted Operations provider overview

The Demo composition can inject the optional provider-usage adapter. Its registered
`platform.provider-usage` flag defaults OFF centrally; its approved presentation
override is also centralized. Only the Operations Demo bootstrap consumes the
pure singleton from `src/platform/feature-flags.js`; other customer
capability dependencies remain forbidden. Production cannot receive the
Demo adapter. The protected production composition has its own fixed insight
ports described below. The client flag and Demo role selector never authorize financial reads.

The provider view prefers the fixed same-origin, bodyless GET
`/api/v1/platform/demo/live-metrics`, with a bounded timeout and explicit unavailable-feed
fallback to its stored snapshot endpoint. Product reads the daily report, the independent
`/api/v1/platform/demo/product-delivery` runtime v2 (or compatible stored v1) projection
and the separate fixed `/api/v1/platform/demo/operations-sources` projection. Runtime
Product coverage and timestamps never replace the saved Delivery or Feedback clocks. The API
independently requires its request-bound owner password capability and explicit
private server snapshot configuration. Public/default CI instances return unavailable,
not synthetic finance data. Real values are never included in this repository or
static artifact. The positive response schema rejects extra fields, unknown authority,
unsafe amounts/times/models and unexpected sources before safe DOM presentation.

`src/platform-admin/provider-usage.js` owns the accessible provider presentation;
the contract and Demo HTTP adapter have their own modules. The shell composes navigation,
bounded revalidation and loading. Existing German/English
messages, locale formatting, tokens, loading/error/retry patterns and native meter
semantics are reused. The view shows dated daily or stored observations, explicit staleness,
the published Launch reference and separate linear projection. It never presents
the reference as an account limit or spend cap, unknown usage as zero, or forecasts
as invoice cost. Warning thresholds are report-only. The independently scheduled daily
collector and separate email-delivery process require their own operational evidence;
the browser performs neither operation. No email address or password is report data.
The selected compact cards, thematic tabs, independent source clocks and missing-data
disclosures are specified in [`PROVIDER-USAGE.md`](./PROVIDER-USAGE.md).

This document describes the browser implementation for the SaaS 3 Platform Control Plane. The accepted trust boundary and deployment topology remain authoritative in
[`SAAS3-PLATFORM-CONTROL-PLANE.md`](./SAAS3-PLATFORM-CONTROL-PLANE.md).

## Runtime separation

The Platform Admin browser is a separate artifact from the customer application and Tenant Admin:

| Runtime | Entrypoint | Composition root | Data authority |
| --- | --- | --- | --- |
| Production | `platform-admin/index.html` | `src/platform-admin/production/bootstrap.js` | Same-origin `/api/v1/platform/*` only |
| Isolated Demo | `platform-admin-demo/index.html` | `src/platform-admin/demo/bootstrap.js` | Same-origin Demo API with server-owned persona/session and shared PostgreSQL state; separately protected Operations projections when configured |

Shared presentation, routing, localization, and defensive response contracts live in `src/platform-admin/`. Production and Demo adapters may import that shared code, but neither runtime may import the other adapter. The customer `src/app.js`, `src/platform/`, customer capability modules, and Tenant Admin do not import Platform Admin code or receive Platform authority.

The Production composition root never imports fixtures, reads browser storage as authority, or falls back to Demo when a session or response is unavailable. Its Content Security Policy limits connections to the operator origin. The Demo Content Security Policy uses `connect-src 'self'` and prohibits direct browser connections to providers or storage.

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
- `src/platform-admin/demo/`: bounded server-backed Demo session/persona, reset and private report adapters, and composition root.
- `src/platform-admin/insight-tabs.js`: keyboard-accessible thematic tabs; selected view state remains in the application.
- `src/platform-admin/insight-source.js`: source-specific status, original observations and explicit fallback reasons.
- `src/platform-admin/product-runtime-contract.js`: exact runtime Product v2 wire validation, mirrored from the API-owned contract.
- `src/platform-admin/demo/insight-source-api.js`: fixed, bounded optional reads; authority and malformed successes fail closed.
- `src/platform-admin/live-metrics-freshness.js`: source observation, sample and window deadlines for presentation; the mirrored wire contract remains unchanged.
- `src/platform-admin/product-delivery-trend.js`: supplied weekly series and locale-aware metric presentation, with unknowns preserved.
- `src/core/i18n-platform-admin-messages.js`: canonical German and English messages.
- `assets/platform-admin.css`: Platform Admin presentation using repository design tokens.
- `scripts/check-platform-admin-boundaries.mjs`: topology, import, storage, network, CSP, and composition-root gate.

Run `npm run check`, `npm run audit`, and `npm run test:e2e`. The E2E suite verifies the isolated Demo, deterministic reset, role/assurance presentation, Production fail-closed behavior, and the fixed step-up request.

## Prepared individual Customer invitation presentation

The explicit `customerInvitationPresentation` application port selects the new
real-customer surface. It is rejected in the closed Demo and is not yet injected
by the Production entrypoint. The centralized optional
`platform.customer-invitations` registry entry defaults OFF. Protected runtime
composition must bind that presentation to a validated server capability and the
new backend invitation services; an unsupported endpoint or malformed response
never activates a legacy fallback.

`customer-invitation-api.js` owns the exact direct Platform contracts for owner-
inclusive Tenant creation and individual list/batch/reissue/revoke. It cannot
call Customer endpoints or select an external origin. The existing authenticated
API transport and fresh exact-request passkey decorator retain every recipient,
Customer role, locale, reason, target, revision, query and command key. Individual
invitation GETs join the same bounded proof queue as writes. The total adapter
deadline includes the existing120-second native passkey ceremony; synthetic
browser assertions are protocol fixtures and are not physical-key acceptance.

`customer-invitation-controller.js` retains only the exact in-memory creation or
batch command after an unknown outcome. Only an explicit retry resubmits its
unchanged UUID and intent. Unknown reissue/revoke requires a current read before
another operation; it never blindly repeats the mutation. Current page revisions
remain authoritative inputs, and the server independently reauthorizes each call.

`customer-invitations-view.js` and `customer-invitations-presentation.js` own native
forms, separate per-person roles/language, owner inclusion guidance, audited
mutation confirmations, bounded pagination, status/focus handoff, DE/EN copy,
localized expiry and responsive layout. Closing or leaving the context clears
transient recipients and pending commands. Language changes preserve the current
draft and pending command. The new lifecycle panel suppresses the legacy single-
claim actions when injected; other lifecycle actions remain shared. A queued or
provider-accepted message is never described as delivered or as granted access.
The configured owner is a server-owned contact, never inferred from login claims.

Source and fixture checks do not constitute live sender, recipient, key recovery,
protected INT cutover or real Microsoft acceptance. Current commit-bound CI and
browser evidence is tracked in SaaS1 issue351; no milestone acceptance is closed by
preparing this inactive port.

## Operation cancellation and invitation read outcomes

The shared operation transport preserves explicit Microsoft and native-passkey
cancellation before a protected request is replayed. A received428 establishes
that the business operation did not execute; a failed challenge or confirmation
therefore has a known not-executed outcome. A transport failure or abort after
dispatching either write remains an unknown outcome. It never becomes a safe
cancellation merely because the local signal was aborted. Existing immutable
command keys and explicit user retries remain authoritative; there is no new
automatic retry. A completed operation whose normal session cannot be refreshed
retains its separate refresh-required result, even when that handler stops the
client.

Microsoft confirmation distinguishes explicit cancellation from unavailable,
invalid or expired status. Poll completions after cancellation cannot complete
the dialog a second time. The Platform API adapter preserves cancellation only
from its typed Microsoft/passkey operation errors; arbitrary matching codes and
ordinary failures retain the existing bounded resource error. Audit export
feedback describes that operation only;
it does not relabel independently loaded audit events or their verification.
Keyboard focus returns to the connected export control when dialog closure left
focus on the document body. A cancelled invitation read uses a neutral status;
other failed list reads report unavailable current data rather than an unknown
write. Initial issuance remains disabled until an explicit successful read.
After a confirmed mutation, a failed list refresh cannot resubmit that mutation.

These source changes address the cancellation/read-outcome subset of issue399.
They do not establish a cause or repair for401/403/404 invitation access failures,
enable synthetic admission, change global routes or entitlement presentation, or
complete real-provider or Hosted acceptance.

## Protected insight navigation

The active application-passkey composition injects independent protected insight
ports for the existing Providers & usage and Product & delivery views. They are
available without selecting a Tenant. Provider navigation additionally requires
the Security Admin role; both ports require runtime-read presentation permission.
The backend independently enforces current passkey assurance, permission and
all-Tenant scope before consulting private aggregate sources.

`production/insights-api.js` uses only fixed bodyless GETs to
`insights/providers` and `insights/product-delivery`, with bounded deadlines,
closed response validation and the exact `application_passkey` source identity.
It cannot call Demo routes or fall back on another source after an authentication,
authorization, availability or malformed-response failure. The Demo adapters and
their default wire validation remain unchanged. Existing cards, tabs, source
clocks, DE/EN messages, locale formatting, error/retry states and design tokens
are reused. The production manifest inventories the newly reachable adapter.

Missing Provider observations remain unavailable. Missing Product collection is
an explicitly uncollected production report with unknown values. Daily feeds,
runtime Product extraction and Operations/Feedback writers are not activated by
this transport; no live metrics or collection acceptance is implied. Tenant detail
menus still require a selected Tenant; optional synthetic controls retain their
separate authentication policy and rollout decision.

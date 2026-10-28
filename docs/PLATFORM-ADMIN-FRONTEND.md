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

Readiness, entitlement, integration-health, diagnostics, Platform-audit, recovery, metering, and runtime sections use their approved Production routes when composed. An unavailable route or source remains explicit; the browser does not fabricate values, call aliases, or load Demo data.

## Diagnostic search time

Correlation lookup explains the identifier's request scope, selected Customer and
period. Its `datetime-local` fields show local wall time in the explicitly named
browser IANA timezone. Submission uses the shared strict timezone converter to
send canonical UTC instants; it does not interpret UTC display text as local time.
Nonexistent or ambiguous DST times require an unambiguous choice before any
lookup request. Editing clears that validation state. The returned correlation
and selected period remain visible after results load.

The presentation/wire regressions cover UTC and Europe/Berlin, DE/EN, winter and
summer, year rollover, DST gaps/overlaps, actual serialized query parameters and
narrow reflow. Their bounded screenshots contain only fixed synthetic loopback
data. These tests do not grant sensitive access or replace the independent
permission, operation-proof, Hosted or provider acceptance gates.

## Shared visual asset reference

Use [ICON-SYSTEM.md](ICON-SYSTEM.md) for versioned functional-icon semantics and
separate Microsoft manufacturer controls. Customer and Platform retain native
repo-local rendering, central DE/EN labels and their own trusted server contracts.
The v0.1 set is an asset draft, not an integrated navigation redesign. Its storage
does not change the Platform artifact inventory, operation authority or live UI.

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

## Individual Customer invitation presentation

The explicit `customerInvitationPresentation` application port selects the
real-customer surface and is rejected in the closed Demo. The Production entrypoint
injects it only when the existing `platform.customer-invitations` protected-document
flag is enabled; the central registry defaults OFF. The authenticated backend still
owns capability, REAL eligibility and authorization. An unsupported endpoint or
malformed response never activates a legacy fallback. Source composition and the
default flag are not evidence that a named Hosted deployment enabled this surface.

`customer-invitation-api.js` owns the exact direct Platform contracts for owner-
inclusive Tenant creation and individual list/batch/reissue/revoke. It cannot
call Customer endpoints or select an external origin. The existing authenticated
API transport and fresh exact-request Microsoft/legacy-passkey decorators retain every recipient,
Customer role, locale, reason, target, revision, query and command key. Individual
invitation GETs join the same bounded proof queue as writes. The total adapter
deadline includes the existing120-second ceremony; synthetic browser assertions
are protocol fixtures and are not real-provider or physical-key acceptance.

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
browser evidence is tracked in SaaS1 issue351; source preparation or conditional
composition does not close that milestone's operating acceptance.

## Operation cancellation and invitation read outcomes

The shared operation transport preserves explicit Microsoft and native-passkey
cancellation before a protected request is replayed. A received428 establishes
that the business operation did not execute; a failed challenge or confirmation
therefore has a known not-executed outcome. A transport failure or abort after
dispatching either write remains an unknown outcome. It never becomes a safe
cancellation merely because the local signal was aborted. Existing immutable
command keys and explicit user retries remain authoritative; there is no new
automatic retry. Cancelling or refusing a later retry cannot establish the outcome
of an earlier unconfirmed write: its original command and unknown outcome remain
until a successful explicit retry or context disposal. A completed operation whose normal session cannot be refreshed
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

The cancellation/read-outcome changes address that subset of issue399. They do
not themselves repair denied invitation access, enable synthetic admission or
complete real-provider or Hosted acceptance. Access feedback is described below;
global routes and entitlement presentation have their separate section.

`platform-api.js` is the active shared API adapter selected by both bootstraps.
Its outcome types live in the adapter-free `operation-errors.js`, and the existing
Production client exports retain those same class identities. Both artifact
manifests include that shared contract without making Demo depend on Production.
The cancellation unit regression imports the same active API adapter as the
Production bootstrap. Its visible DE/EN browser regressions run early in each
engine and again in the unchanged full suite; permanent Demo/reset gates remain.

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

## Persistent global routes and entitlement previews

Global navigation uses the validated hash as its presentation source of truth:
`#fleet` retains the directory entry point, while `#fleet=product-delivery&tab=feedback`
and `#fleet=providers&tab=sources` identify an allowed global view and its tab.
Other global sections use `#fleet=<view>`; existing `#tenant=<uuid>&section=<section>`
links remain supported. Unknown views/tabs, duplicate keys, mixed global/Tenant
parameters and oversized hashes fall back to the directory. Optional ports and
operator presentation permissions are checked independently before a deep link
can load a global resource. A URL never grants backend authority and carries no
customer content, identity, command or proof. Tab changes create history entries
without replacing the active controls; reload and browser history reconstruct the
selected page/panel. Existing heading focus and asynchronous insight freshness
handoffs remain. The bounded in-memory navigation destinations remember the last
validated tab per global page when revisiting through the menu; they do not replace
the active URL or persist protected content. Role/context disposal clears these
destinations and protected caches as before.

The entitlement workspace renders localized capability names, dependencies and
expandable technical identifiers using native labels/checkboxes and existing
tokens. An unchanged selection explains why preview is disabled. Missing packages
have an explicit empty state; package preview controls require the existing manage
presentation permission. Preview requests are explicit, show loading/confirmation
context, prevent concurrent local submissions and preserve the selection/focus on
failure or cancellation. Successful direct previews retain their reviewed draft;
changing that selection hides its previous Apply control until it matches again
or receives a new authoritative preview. Apply still requires the unchanged exact
server revision, action, target confirmation and operational reason.

Navigation generation and resource identity checks discard late preview results
after departure, authority/context replacement or stop, including leave-and-return
to the same Tenant. This does not add browser persistence, authorization or automatic
retries. Targeted DE/EN, history, permission, failure, selection, focus and late-response
browser cases accompany the ordinary complete engine and permanent Demo/reset gates.
The source change covers399 UX-03/UX-04; invitation admission, real-provider proof,
email delivery and Hosted acceptance remain separate open evidence.

## Invitation access feedback

The Platform invitation controller distinguishes an invalid/expired session
(HTTP401), refused access (HTTP403) and invitations unavailable for the selected
customer (HTTP404). Only401 recommends signing in again.403 asks users to check
permissions/customer selection;404 asks them to check the selection or contact the
platform owner. Neither message claims to know a concealed object's existence or
the server's internal eligibility reason. DE/EN messages use the existing alert
and explicit-refresh controls. Issuance stays disabled after a failed list read
until a successful explicit refresh, and known creation denials cannot be retried
as new writes from the same blocked controller.

This changes presentation, not backend authorization or synthetic eligibility.
An earlier unknown write retains its original command and unknown outcome even
when a later check returns401/403/404; no automatic retry, login or write is added.
The backend's current strict REAL-only invitation scope remains unchanged. The
observed source cause was the previous controller's collapse of all three HTTP
statuses into the same sign-in instruction. The specific status/cause of the
historical Hosted Demo failure remains unobserved; this source correction does
not claim successful Demo admission or operating acceptance for issue399 UX-02.


## Fresh synthetic workspace management

The production workspace delegates an explicit Manage selection to the Platform
application's owned navigation port. That port clears the preceding directory
filters/cursor and reads a fresh authorized directory page before selecting the
existing lifecycle route. The workspace's generation projection and its URL are
not a substitute for that directory projection or backend authority. A target
absent from the current page remains in the directory with a localized unavailable
notice; no missing Tenant record is synthesized. Existing directory pagination
and server authorization remain unchanged.

Navigation generations suppress a late target handoff after departure or stop.
Read failure retains the existing unavailable directory state and explicit retry;
no write, Microsoft proof or generation replacement is replayed. Ordinary browser
regressions cover fresh-generation keyboard management, DE/EN missing targets,
failed reads and navigation during a deferred response. The protected invited
participant cases each create the full canonical generation through actual UI.
The Employee/Manager case first activates initially-ready Contoso through the
operator's actual Tenant Admin handoff; its invited Manager never inherits Admin
or adopts that delegated identity. A separate complete case proves invited
Fabrikam Admin onboarding from its initial state. All three role-owned business
workflows remain actual end-to-end operations, without fixture directory seeding.
Native three-member/same-generation and all permanent three-customer/two-reset
acceptance remain independently required and unchanged.


The isolated participant cases also respect the actual five-unexpired-proof
Microsoft operation budget, including already consumed proofs until expiry. Their
fixture reads the database-derived capacity and waits for the original expiry
before requesting the next operation. Invitation writes reserve capacity for
their independent post-mutation list-read proof as well. No proof, counter, clock,
rate, replay rule or browser deadline is changed. Each complete case retains the
existing240-second limit, including its own setup, real wait where needed and
actual operations; local fixture code
is not evidence that the complete paired browser case passed.

# SaaS 3.6 Security Regression and Defect Classification

## Purpose

This register records Demo/shared-runtime and Production-reachable findings discovered while reconciling the SaaS 3.5 shared Demo baseline with, and hardening, the Production authorization and persistence contract for SaaS 3.6.

Roadmap Approved Version 11 (2026-09-01) and `docs/ROLE-MODEL.md` are the current authority for customer roles and configuration ownership. Earlier SaaS 2/3 actor examples remain historical evidence only where this register explicitly classifies the resulting correction.

Every finding is classified as exactly one of:

- `demo-only`
- `shared-business-domain`
- `production-defect`
- `security-relevant`

The classification describes Production reachability and determines the required correction/evidence. A finding is not downgraded merely because it was first observed in Demo.

## Classification register

### D-001 — Catalogue wire contract omitted Room prices

Classification: `production-defect`

Affected modules:

- `src/platform/tenant-catalogue-settings-api.js`
- Tenant Catalogue Production administration flow

Evidence and reachability:

- The API Catalogue contract contains authoritative `roomPrices`.
- The frontend exact-object validator previously omitted `roomPrices`, so a correct Production response could be rejected or Room-price state could be omitted from the write projection.
- The path is Production-reachable; this is not Demo-specific.

Correction and regression:

- Added `roomPrices` to the exact Catalogue read/write contract.
- Added exact Room-price validation, bounded collection size, duplicate `roomId` rejection and unknown-field rejection.
- Progression tests verify all five Catalogue collections round-trip.
- Negative tests reject duplicate prices and injected provider/unknown fields.

Residual limitation: none in the client contract. Server-side Catalogue validation remains authoritative.

### D-002 — Catalogue ownership inherited Tenant Admin configuration authority

Classification: `security-relevant`

CWE/OWASP relevance: broken access control / CWE-862 (Missing Authorization), OWASP A01.

Affected modules:

- frontend Tenant Admin Catalogue presentation
- API Tenant Catalogue service
- canonical role/permission policy

Evidence and reachability:

- The pre-3.6 implementation used generic `tenant:configure` for Catalogue mutation.
- The accepted role model assigns Tenant Catalogue and authoritative Room prices to Conference Manager, independently from Tenant Admin technical configuration.
- The path is Production-reachable and authorization-relevant.

Correction and regression:

- Added `tenant:catalogue:manage` to the canonical Conference Manager permission set.
- API Catalogue mutation now requires that permission; Tenant Admin alone is denied.
- Frontend creates the Catalogue adapter only for the Conference Manager capability and removes Catalogue from Tenant Admin registry/source graph.
- Employee, Tenant Admin-only and cross-Tenant negative API tests deny mutation.
- Dual role receives the exact permission union.

Residual limitation: external hosted Demo acceptance must use the immutable frontend/runtime refs produced by the completed milestone.

### D-003 — Location administration mixed technical and Room-business ownership

Classification: `security-relevant`

CWE/OWASP relevance: broken access control / CWE-862 and object-property authorization boundary, OWASP A01.

Affected modules:

- API Tenant Location administration service
- frontend Tenant Admin Locations section
- frontend Conference Manager business settings

Evidence and reachability:

- The earlier UI edited Sites, Room technical assignment and Room business fields in one Tenant Admin form.
- The accepted model assigns Room business data to Conference Manager while Site/provider/technical mapping remains Tenant Admin-owned.
- The path is Production-reachable.

Correction and regression:

- API classifies each Location mutation against the persisted current snapshot.
- Technical changes require `tenant:configure`; Room-business changes require `tenant:rooms:business:manage`; mixed changes require both.
- Frontend uses explicit ownership projections:
  - Conference Manager projection preserves Sites and Room `id`/`siteId`.
  - Tenant Admin projection preserves all Room business fields and allows technical Site management/Room-to-Site assignment.
- Negative frontend tests reject field injection and scope manipulation.
- API tests deny cross-Tenant and role-inappropriate mutations.

Residual limitation: historical mixed snapshots are displayed but are not exposed as a single-role rollback write path. A mixed rollback would require dual-role authorization.

### D-004 — Customer Demo lacked an explicit dual-role persona

Classification: `demo-only`

Affected modules:

- Demo customer persona service
- Demo session normalization and selector UI

Evidence and reachability:

- Production already supports independent elevated roles and their union.
- The Demo selector previously exposed only Employee, Conference Manager and Tenant Admin, so the accepted dual-role union could not be demonstrated end-to-end.
- The missing selector is not Production-reachable.

Correction and regression:

- Added derived `dual_role` Demo persona without creating a new persisted authorization role.
- Demo server issues Employee + Conference Manager + Tenant Admin and the exact canonical permission union.
- Frontend validates the returned session through the same Production session contract and rejects persona/role mismatches.
- Unit tests cover issuance, re-establishment, context switching and exact union.

Residual limitation: none beyond the normal Demo-only synthetic identity boundary.

### D-005 — Customer UI remained visible after prolonged inactivity

Classification: `security-relevant`

CWE/OWASP relevance: CWE-613 (Insufficient Session Expiration) defense-in-depth; server session expiration remains authoritative.

Affected modules:

- `src/platform/inactivity-lock.js`
- Production and Demo customer bootstrap

Evidence and reachability:

- Server-side expiry/revocation/security-version validation already existed, but an unattended authenticated browser could continue displaying previously rendered sensitive content until a new server request occurred.
- This is Production-reachable and security-relevant as a local confidentiality/control gap.

Correction and regression:

- Production locks after 15 minutes of inactivity; Demo locks after 5 minutes.
- Lock clears primary navigation and application content and removes the Demo context selector.
- Lock closes/removes every pre-existing body-level dialog, invalidates pending application renders
  and observes the locked document so later shell/subscription/async mutations are cleared again.
- Unlock calls the authoritative session runtime `bootstrap()` before any content can return.
- Expired/revoked/stale-security-version sessions therefore cannot restore old UI authority.
- BroadcastChannel propagates lock only; unlock is never propagated as authority.
- `pageshow`/visibility evaluation covers background/BFCache elapsed time.
- Deterministic unit tests cover activity reset, elapsed-time lock, external-tab lock and stop/race behavior.

Residual limitation: browser UI lock is additive only. Direct API authorization continues to depend exclusively on the server session and authorization policy.

### D-006 — Shared Demo cross-role helper waits on a fragile full-load navigation event

Classification: `demo-only`

Affected modules:

- `tests/e2e-shared/shared-demo-runtime.spec.js`
- immutable shared-Demo frontend reference used by API CI

Evidence and reachability:

- Both Chromium and WebKit timed out waiting for `page.waitForNavigation({ waitUntil: 'load' })` after a Demo persona switch even though the selector triggers a controlled reload.
- The failing API CI also served the pre-3.6 immutable frontend ref, which cannot satisfy the new 3.6 role/permission contract.
- The helper and immutable test coupling are Demo acceptance infrastructure; Production runtime does not call this code.

Correction and regression:

- The shared Demo E2E helper is updated to wait on an observable post-reload application/session state instead of the race-prone full-load event.
- API shared-Demo CI is updated to the immutable frontend ref produced by the completed frontend 3.6 change.
- Chromium and WebKit shared-Demo jobs must pass before merge/final gate.

Residual limitation: hosted Render acceptance additionally verifies the public deployment identity before and after the destructive Demo journey.

### D-007 — Production browser fixtures silently booted the Demo composition root

Classification: `security-relevant`

Affected modules:

- Production E2E HTML fixtures
- Customer Production/Demo architecture gate

Evidence and reachability:

- `index.html` advanced its immutable Demo bootstrap cache marker while five Production fixtures
  continued replacing the previous marker literally.
- The replacement became a silent no-op, so nominal Production tests booted Demo controls and
  produced 54 Chromium/WebKit failures. The architecture gate checked only for the same stale
  literal and therefore did not prove the generated document.
- Production runtime code was unchanged, but the defect invalidated security evidence for the
  Production composition boundary and could conceal future Demo-to-Production regressions.

Correction and regression:

- All Production fixtures use one exact runtime transformation that retains the current immutable
  cache marker while replacing only the composition root.
- The architecture gate executes that transformation against canonical `index.html`, requires the
  Production entry and forbids the Demo entry.
- The transformation fails closed unless exactly one canonical runtime marker and exactly one
  bootstrap marker exist. Focused unit coverage proves the current canonical and missing-marker
  cases; the exact-count implementation also rejects duplicates.
- Final Chromium/WebKit CI evidence is required on the corrected head.

Residual limitation: none after exact-head browser CI passes.

### D-008 — Successful Organization save could retain stale Tenant presentation

Classification: `production-defect`

Affected modules:

- `src/platform/tenant-presentation-runtime.js`
- Tenant Admin Organization save and shared-Demo acceptance

Evidence and reachability:

- API PR #61 shared-Demo WebKit received HTTP 200 from the Organization write but retained the old
  brand title until the assertion timed out; Chromium happened to pass.
- The Production-reachable wrapper waited for a follow-up presentation read, but a bounded timeout
  was converted to the global fallback and the already validated server mutation response was not
  applied. The save could therefore be reported as successful while the shell stayed stale.

Correction and regression:

- The normalized Organization mutation result is projected immediately into the minimized Tenant
  presentation contract, invalidating any older in-flight refresh.
- The canonical presentation endpoint is still re-read, but a transient post-save read failure
  preserves the newer server mutation projection instead of reverting the shell.
- Unit tests cover abort/timeout, revision ordering, branding, locale and currency; shared-Demo
  Chromium/WebKit must pass on the exact integrated refs.

Residual limitation: initial bootstrap and ordinary refresh failures still fail closed to the
product-default presentation. Preservation applies only after a validated server mutation result.

### D-009 — Conference Manager could not cancel another User's Request

Classification: `security-relevant`

CWE/OWASP relevance: authorization-policy completeness / OWASP A01.

Affected modules:

- API Request transition authorization
- Conference Manager Production UI

Evidence and reachability:

- The accepted role contract permits Tenant-wide Conference Manager change/cancel operations, but
  the public `cancel` transition always used the Employee owner-only rule.
- Tenant Admin-only must not inherit this authority, and broadening Employee cancellation would
  create a privilege escalation; the correction therefore belongs in the server policy rather
  than a client visibility rule.

Correction and regression:

- API policy grants `cancel` to Conference Manager + `request:manage` for a same-Tenant eligible
  Request while retaining owner-only Employee cancellation, Tenant Admin separation, CSRF, audit,
  state/reconciliation and no-physical-delete rules.
- Frontend Manager workflow exposes an accessible confirmed destructive action and the existing
  confirmed-booking proposal/decision flow, including supported same-Manager self-approval.
- Negative API tests cover cross-Tenant concealment, Tenant Admin-only, rejected state, missing CSRF
  and absent DELETE route; progression and both-browser evidence remain exact-head gates.

Residual limitation: none after API/frontend integration and final CI.

### D-010 — Shared Demo gate duplicated the PostgreSQL transaction lifecycle

Classification: `demo-only`

Affected modules:

- API shared-Demo runtime gate
- canonical PostgreSQL transaction helper

Evidence and reachability:

- The Demo readiness gate owned a second hand-written connect/BEGIN/UTC/COMMIT/ROLLBACK/release
  lifecycle. Production composition did not import the gate, but failure-path maintenance could
  diverge and invalidate shared-Demo evidence.

Correction and regression:

- API PR #61 delegates the full lifecycle to the canonical transaction helper and adds explicit
  infrastructure-error mapping without rewriting work errors.
- Regression tests prohibit lifecycle duplication and cover connect/setup/commit/work failures.

Residual limitation: the correction is present on API implementation head `9221ada40b8a65dcf243d664c2e87241dce7083d`, but that reference is not merged `main` evidence. The current paired release candidate must be revalidated against compatible immutable frontend/API refs and merged through the required gates; exact run state remains in `docs/SAAS-3.6-HARDENING-REGISTER.md`.

### D-011 — Role-policy session epoch was reversible on binary rollback

Classification: `security-relevant`

CWE/OWASP relevance: CWE-613 (Insufficient Session Expiration), OWASP A07/A01.

Affected modules:

- API Customer session persistence and lookup
- SaaS 3.6 deployment/rollback procedure

Evidence and reachability:

- Namespacing token hashes with the SaaS 3.6 policy epoch prevents the new binary from resolving old
  rows, but it does not remove or persistently revoke those rows.
- A rollback to the pre-epoch binary could hash an unchanged unexpired cookie under the legacy
  scheme and resurrect a permission snapshot from the superseded role model.
- The risk is Production-reachable during rollback and cannot be closed by frontend re-login copy or
  documentation alone.

Correction and regression:

- API migration 034 performs persistent, one-way revocation of active Customer sessions before the
  new role policy becomes authoritative; its rollback does not recreate revoked session rows.
- The security epoch remains part of authority-hash derivation, and focused database tests cover
  forward rejection, rollback-time non-resurrection and re-forward deployment.
- Operations documentation states the forced reauthentication/CSRF reissue impact and the exact
  forward, rollback and emergency procedure.

Residual limitation: the implementation and focused evidence are present on API implementation head `9221ada40b8a65dcf243d664c2e87241dce7083d`, but the control is not integrated into `main`. The current paired release candidate still requires compatible-ref validation, required review and merge; this document does not treat branch evidence as deployment evidence.

### D-012 — Booking-change denials lacked direct audit and BOLA evidence

Classification: `security-relevant`

CWE/OWASP relevance: CWE-862 (Missing Authorization evidence), CWE-639 (Authorization Bypass
Through User-Controlled Key), OWASP A01.

Affected modules:

- API booking-change application service
- Request authorization-denial audit evidence

Evidence and reachability:

- Booking-change propose/read/decision paths called the authorization policy directly and correctly
  denied unauthorized actors, but did not record the minimized `authorization.denied` event emitted
  by the surrounding Request and Tenant-settings services.
- Concealed cross-Tenant/not-found probes intentionally do not become public 403 responses, so HTTP
  status metrics alone cannot establish the negative authorization evidence.
- Direct service negatives for Employee non-owner, Tenant Admin other-user, Conference Manager
  cross-Tenant and mismatched change identifiers were missing.

Correction and regression:

- The API correction preserves the concealed response and least-privilege policy while recording
  only bounded actor/Tenant/operation denial evidence; it does not disclose whether a probed
  Request/change exists.
- Direct policy/service negatives cover propose, decision and change-ID access across Employee
  non-owner, Tenant Admin other-user, Conference Manager cross-Tenant and wrong-change-ID boundaries.

Residual limitation: the correction and focused evidence are present on API implementation head `9221ada40b8a65dcf243d664c2e87241dce7083d`, but the API change is not integrated into `main`. Compatible paired-candidate validation, required review and merge remain mandatory.

### D-013 — Tenant bulk-transfer downloads used the navigation URL trust path

Classification: `production-defect`

Hardening reference: H-018.

Affected modules:

- shared Tenant bulk-transfer presentation
- Tenant Admin and Conference Manager Production settings surfaces

Evidence and reachability:

- The generic navigation sanitizer correctly rejects the `blob:` scheme.
- The bulk-transfer panel passed its internally created Object URL through that sanitizer, so the
  temporary template/export anchor received no usable `href` and silently downloaded nothing.
- Broadening the generic navigation allowlist would weaken a shared trust boundary for a local
  presentation defect.

Correction and regression:

- The panel assigns only an Object URL it created from its already serialized in-memory JSON to a
  temporary download anchor, activates/removes the anchor and revokes the URL.
- The generic navigation sanitizer remains unchanged and fail closed for arbitrary `blob:` URLs.
- Contract coverage verifies exact template/export content, filenames, revocation, failure recovery
  and suppression when the owning view is no longer current.

Residual limitation: final exact-head repository/browser evidence and merge remain required.

### D-014 — Historical current-Room presentation lacked an exact object boundary

Classification: `security-relevant`

CWE/OWASP relevance: CWE-639 (Authorization Bypass Through User-Controlled Key), object-property
authorization and OWASP A01.

Hardening reference: H-019.

Affected modules:

- API Request current-Room-context endpoint
- Employee and Conference Manager confirmed-booking presentation
- `src/shared/request-room-context-loader.js`

Evidence and reachability:

- The active application catalogue intentionally excludes inactive Rooms/Sites, while a confirmed
  Request may still reference one. Expanding that catalogue would make historical configuration
  appear selectable and expose data outside the booking-change need.
- The initial browser fallback could compare two absent Site identifiers as equal and then
  dereference absent context when the current Room was missing. This made the fail-closed path crash
  instead of returning unavailable time-zone authority.
- The path is Production-reachable and combines same-object authorization, Tenant isolation,
  configuration-revision coherence and property-minimization requirements.

Correction and regression:

- `GET /api/v1/requests/{requestId}/room-context` uses the same Principal-derived Tenant/object read
  boundary as Request detail and returns only the exact Request reference, Locations revision and
  current Room/Site presentation fields.
- The client accepts context only when Request ID/schema/version/status, current Room ID and
  `locationsRevision` match its validated Request/catalogue. One bounded refresh is allowed for a
  revision race; unresolved mismatch, timeout or malformed data fails closed.
- An inactive current Room/Site is display-only and disabled. Only active Rooms under active Sites
  from the active catalogue are selectable.
- Historical context grants no price, provider, technical mapping, permission, policy, selectable
  flag or mutation-payload authority.
- Time-zone lookup requires an actual current Room. It uses historical Site context only when that
  Room's `siteId` exactly matches; missing Room/context or mismatch returns no authority without
  browser-time or implicit-UTC fallback.

Residual limitation: API and frontend changes require compatible exact-candidate validation,
required review and merge. Repository tests cannot self-approve hosted or Production acceptance.

### D-015 — Booking-change optimistic concurrency used a newer unread draft token

Classification: `production-defect`

Hardening reference: H-020.

Affected modules:

- Production booking-change API adapter
- shared confirmed-booking change editor

Evidence and reachability:

- The browser re-read the Request immediately before proposal submission and used that newer version
  as `expectedVersion`, although the User's proposal draft was composed from the older displayed
  Request.
- A concurrent mutation could therefore advance the browser token without updating every displayed
  input, defeating the intended lost-update conflict for stale presentation.

Correction and regression:

- The editor passes the version of the validated Request actually displayed to the User.
- The adapter requires that explicit version, performs one exact proposal POST without a preflight
  Request read and rejects an invalid token before transport.
- The backend remains authoritative and must reject a stale `expectedVersion`.

Residual limitation: final exact-head contract/browser evidence and merge remain required.

### D-016 — Bulk validation receipts could cross aggregate and lifecycle boundaries

Classification: `production-defect`

Hardening reference: H-021.

Affected modules:

- `src/shared/tenant-bulk-transfer-panel.js`
- Conference Manager Room/Catalogue settings
- Tenant Admin technical Locations/Cost Allocation settings

Evidence and reachability:

- After Version 11 ownership reassignment, the UI exposed bulk transfer only through Tenant Admin
  Cost Allocation, leaving owned Conference Manager and technical Locations aggregates unreachable.
- An older validation completion could replace a newer receipt and pair captured content with the
  currently selected type. Detached or locked views could also download, announce or rerender after
  their authority-bearing surface had been replaced.

Correction and regression:

- The capability-neutral panel receives an explicit aggregate allowlist and adapter from its owning
  capability: Conference Manager receives `rooms`, `services`, `catering-items` and
  `catering-packages`; Tenant Admin receives `sites`, technical `rooms` and `cost-centers`.
- A monotonically invalidated generation and captured type, file, parsed document and receipt bind
  Apply to the exact latest successful validation. Changing type/file invalidates old validation,
  and validation cannot overlap a pending Apply.
- Current-view, DOM-connection and inactivity-lock checks suppress stale downloads, announcements,
  rerenders and receipt installation.
- The server still derives Principal/Tenant, enforces aggregate permission and revision, classifies
  Room properties and verifies the receipt; browser lifecycle guards do not authorize Apply.

Residual limitation: final exact-head Chromium/WebKit evidence and merge remain required.

### D-017 — Superseded Employee editor renders could mutate current state

Classification: `production-defect`

Hardening reference: H-022.

Affected modules:

- Production Employee create/repeat/resubmit editor
- request draft, catalogue and availability continuations

Evidence and reachability:

- Overlapping renders shared mutable catalogue state and consumed queued repeat/resubmit intent only
  after an unguarded catalogue await.
- A detached older render could consume the current intent, replace the newer catalogue snapshot,
  save a stale draft, navigate or announce success after navigation or inactivity lock.

Correction and regression:

- Each editor invocation owns a monotonic generation, current-root/lock guard and immutable catalogue
  snapshot.
- Only the current successful render may publish its catalogue or consume queued intent; draft,
  availability and submit continuations suppress every effect after detachment/supersession.

Residual limitation: final exact-head browser evidence and merge remain required.

### D-018 — Booking-change proposal reservation did not survive a list refresh

Classification: `production-defect`

Hardening reference: H-023.

Affected modules:

- Production Employee confirmed-booking proposal orchestration
- Request list/card rerender lifecycle

Evidence and reachability:

- Proposal pending state lived only inside the current dialog. A Request-list refresh during a held
  POST produced a replacement card whose Change action could start a second proposal for the same
  Request.
- The duplicate wire mutation created avoidable concurrency conflicts and incoherent recovery state.

Correction and regression:

- An application-level per-Request coordinator reserves the Request through context preparation,
  dialog lifetime and POST settlement.
- Replacement projections disable competing mutations; cancellation, success and stale preparation
  release only the reservation instance they own and reconcile through the current Request surface.

Residual limitation: final exact-head browser evidence and merge remain required.

### D-019 — Booking-change decision transport admitted expanded intent

Classification: `production-defect`

Hardening reference: H-024.

Affected modules:

- Production booking-change decision adapter

Evidence and reachability:

- The exported adapter accepted reject without a reason and approve with an arbitrary reason even
  though the current UI happened to call it with the intended shapes.
- Relying only on backend validation left a Production-reachable client contract broader than the
  supported workflow and made future callers more likely to send invalid intent.

Correction and regression:

- Approve accepts no reason; reject requires a trimmed 1..1000-character reason.
- Unsupported or expanded intent fails before transport, and contract coverage verifies both exact
  request bodies and no-transport negatives.

Residual limitation: merge and final exact-head repository evidence remain required.

### D-020 — Tenant-settings save completion crossed detached render roots

Classification: `production-defect`

Hardening reference: H-025.

Affected modules:

- Tenant Admin Organization section
- Tenant Admin Booking Policies section
- Tenant Admin Cost Allocation section
- Tenant Admin technical Locations section

Evidence and reachability:

- Successful save presentation queued focus against a section root that the shell rerender then
  detached. The focus request was consumed before the animation-frame callback proved a current,
  connected heading.
- Save and conflict-reapply continuations also needed the same current-render boundary so a response
  from a section the User left could not announce, show a toast, render conflict recovery or replace
  a later surface.
- Conflict reapply loaded a fresh revision before its second privileged PUT but did not re-check that
  the initiating section was still current between those operations. Locations likewise presented
  save success/failure globally after a held PUT settled against a detached section.
- Shared mutable pending-draft fields allowed separate asynchronous attempts to overwrite the data
  captured by an earlier attempt.

Correction and regression:

- Each submit captures its own exact handler-local draft, and every post-await
  success/error/reapply effect checks the section's current-render contract. Conflict reapply checks
  again after the revision read and before the second PUT; a stale generation cannot issue it.
- The focus request remains pending across the owned rerender and is consumed only after the current
  connected section heading is focused.
- Locations serializes its save intent and suppresses detached success/failure presentation.
- Detached/superseded continuations produce no presentation effect.

Residual limitation: the correction is currently worktree state; it requires commit-scoped
repository and Chromium/WebKit evidence plus merge before completion can be claimed.

## Hardening traceability

The hardening register owns mutable status and exact CI/merge evidence. This document owns the
Production-reachability classification and stable correction boundary.

| Security-regression finding | Hardening finding | Relationship |
| --- | --- | --- |
| D-005 | H-001 | Inactivity-lock dialog/render race and authoritative unlock boundary. |
| D-007 | H-007 | Production-fixture composition and canonical-permission evidence integrity. |
| D-008 | H-016 | Organization mutation/presentation revision ordering. |
| D-009 | H-015 | Tenant-wide Conference Manager cancellation/change authorization. |
| D-010 | H-013 | Canonical shared-Demo PostgreSQL transaction lifecycle. |
| D-011 | H-005 | Irreversible role-policy session invalidation. |
| D-012 | H-017 | Booking-change authorization-denial/BOLA evidence. |
| D-013 | H-018 | Locally created bulk-download Object URL boundary. |
| D-014 | H-019 | Same-object current-Room context and selection/time-zone fail-close boundary. |
| D-015 | H-020 | Displayed-Request optimistic-concurrency token. |
| D-016 | H-021 | Aggregate-scoped receipt binding and async lifecycle. |
| D-017 | H-022 | Employee editor render-generation boundary. |
| D-018 | H-023 | Per-Request proposal reservation across rerenders. |
| D-019 | H-024 | Exact booking-change decision transport intent. |
| D-020 | H-025 | Tenant-settings post-save render/focus lifecycle. |

Hardening findings not listed here either predate this Demo/shared-runtime classification set or are
scanner, governance, documentation, test-evidence or release-operation items whose scope/status is
defined directly in `docs/SAAS-3.6-HARDENING-REGISTER.md`. Absence from this mapping must not be read
as closure or as a lower severity.

## Security re-proof matrix

| Control | Required evidence |
| --- | --- |
| Principal authority | Server-issued session roles/permissions; frontend rejects non-canonical role/permission projection. |
| Tenant scope / BOLA | Cross-Tenant request, Catalogue, Location and administration negative tests deny access. |
| Booking-change IDOR/audit | Non-owner, Tenant Admin-only, cross-Tenant and mismatched change-ID propose/decision probes stay denied/concealed and emit minimized denial evidence. |
| Employee baseline | Effective customer principal includes Employee for active users; elevated roles remain additive. |
| Independent elevated roles | Conference Manager and Tenant Admin capabilities are separately tested; neither inherits the other. |
| Dual role | Exact union tested in API, Production-session validation and Demo persona/session flow. |
| CSRF | Same-origin mutating calls use the current in-memory server-issued CSRF token; context/session refresh rotates authority normally. |
| Idle lock | Sensitive UI is cleared; unlock re-bootstrap is mandatory; cross-tab signal can lock only. |
| Session expiry/revocation | Server bootstrap and `security_version` semantics win over browser state. |
| Malformed input | Exact-object client contracts and API validation fail closed for unknown/malformed fields. |
| Demo/Production separation | Production entry graph does not import Demo session/persona modules or local fallback. |
| Customer/Platform separation | Platform Admin has independent entrypoints, identity/session contract and authorization domain. |
| Shared Demo persistence | Shared PostgreSQL state is tenant-scoped and contains synthetic Demo identities/data only. |
| Demo reset | Reset operations are Demo-only, bounded, audited/evidenced by hosted acceptance and never a Production data path. |
| Demo outage | No browser-local fallback establishes customer authority when the shared Demo server is unavailable. |
| Provider identity | Provider Room identity/resource mapping remains server-controlled and Tenant Admin-authorized. |
| Current Room context | Same-object and cross-Tenant negatives conceal unauthorized Requests; exact Request/version/status/Room/Locations-revision correlation is enforced; missing/malformed context and absent Room fail closed without browser-time/UTC fallback. |
| Active Room selection | Historical inactive Room/Site context is disabled presentation only; selectable Rooms come solely from the active catalogue and remain server-revalidated. |
| Optimistic concurrency | Booking-change proposal sends the displayed validated Request version without a token-advancing preflight read; stale version is rejected by the backend. |
| Bulk receipt and aggregate scope | Each role receives only injected owned aggregate types; Apply binds exact type/file/document/latest receipt; backend permission, revision, field classification and receipt validation remain authoritative. |
| Async render lifecycle | Superseded, detached or inactivity-locked editors/settings/bulk surfaces cannot publish state, announce, download, navigate, consume focus or issue a second mutation. |
| Decision transport | Approve/reject requests use exact bounded intent and invalid reason shapes fail before transport while backend validation remains authoritative. |

## Validation gates

Milestone completion requires, at minimum:

- frontend `npm run check`
- frontend `npm run audit`
- frontend browser E2E, including shared Demo
- backend `npm run check`
- backend `npm run test:db`
- backend dependency/secret/security gates
- shared Demo Chromium and WebKit against compatible immutable frontend/runtime refs
- hosted Demo deployment-identity and destructive-journey evidence where externally available

No failed security or Tenant-isolation check may be waived for milestone completion.

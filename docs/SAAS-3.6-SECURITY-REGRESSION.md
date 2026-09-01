# SaaS 3.6 Security Regression and Defect Classification

## Purpose

This register records Demo/shared-runtime findings discovered while reconciling the SaaS 3.5 shared Demo baseline with the Production authorization and persistence contract for SaaS 3.6.

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
- Unit coverage fails closed when either canonical marker is missing or duplicated.
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

Residual limitation: API merge and exact-head CI evidence remain required.

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

- Deployment must perform a persistent, one-way revocation/deletion or an equivalent server-enforced
  control before the new role policy becomes authoritative.
- Tests must prove both forward rejection and rollback-time non-resurrection of legacy sessions.
- Operations documentation must state the forced reauthentication/CSRF reissue impact and the exact
  forward, rollback and emergency procedure.

Residual limitation: open until the API control, migration/operation and exact tests are integrated.

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

- Preserve the existing concealed response and least-privilege policy while recording only bounded
  actor/Tenant/operation denial evidence; do not disclose whether a probed Request/change exists.
- Add policy/service negatives for propose, decision and change-ID access across every independent
  role and Tenant boundary.

Residual limitation: open until the API correction and exact-head database/unit/CI evidence are
integrated.

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

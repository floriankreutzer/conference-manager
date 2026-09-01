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

## Security re-proof matrix

| Control | Required evidence |
| --- | --- |
| Principal authority | Server-issued session roles/permissions; frontend rejects non-canonical role/permission projection. |
| Tenant scope / BOLA | Cross-Tenant request, Catalogue, Location and administration negative tests deny access. |
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

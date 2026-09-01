# SaaS 3.6 hardening register

Status date: 2026-09-01
Parent roadmap: #164
Hardening work package: #171
Security-regression work package: #168
Final gate: #170

## Purpose and completion rule

This register is the single evidence-oriented inventory for SaaS 3.6 repository-controlled defects,
security findings, code-quality weaknesses and material documentation/evidence gaps across
`conference-manager` and `conference-manager-api`. A finding is not closed merely because a test is
green: its root cause, Production relevance and controlling regression evidence must be identified.

`Critical`/`High` repository-controlled security findings, Tenant-isolation/privilege/session/CSRF/
Demo-Production-boundary/data-integrity defects and reproducible P0/P1 correctness defects are
release blocking. Medium findings are resolved where a scoped fix is reasonable; residual Low items
must be explicitly non-blocking. Scanner/test suppression is not an accepted disposition.

Production relevance uses the #168 classifications for Demo-originated defects:
`demo-only`, `shared-business-domain`, `production-defect`, or `security-relevant`. Findings that did
not originate in Demo are marked with the narrower relevant runtime/evidence scope instead of being
misrepresented as Demo discoveries.

## Findings

| ID | Severity | Domain/runtime | Production relevance | Finding / evidence | Disposition | Status |
| --- | --- | --- | --- | --- | --- | --- |
| H-001 | High / P1 | Customer frontend session lock | security-relevant | PR #173 review: previously open body-level dialogs could remain interactive above cleared `#app`; language/presentation rerenders could restore stale UI after lock. | The branch now closes/removes open dialogs, invalidates pending shell/feature renders, clears restored UI through the lock observer and requires a full session bootstrap on unlock. Production and shared-Demo browser regressions cover overlays, cross-tab lock, stale render attempts and direct-route re-entry. | **FIXED ON BRANCH — scoped Production regressions passed on `4a948897`; corrected final-head browser CI and merge pending** |
| H-002 | Low / test correctness | Static GitHub Pages Demo launchpad | demo-only | PR #173 regression assertion rejected the documented phrase `static GitHub Pages Demo launchpad`. | `1ca39e5` aligns the assertion. Frontend quality, Secret Scan, Dependency Review, Hosted Demo Acceptance and shared-Demo E2E were green on that head. | Closed |
| H-003 | High / P1 correctness | Conference Manager catalogue UI | shared-business-domain | PR #173 review: moving catalogue ownership out of Tenant Admin removed creation controls, leaving only editing of existing services/equipment/catering entries. Package-variant creation also existed in the previous canonical UI and must not be lost. | The branch restores bounded stable-ID creation for services, equipment, catering items/packages and variants under Conference Manager, retaining currency, exact wire validation and optimistic concurrency. DE/EN, model and browser regressions cover every collection. | **FIXED ON BRANCH — scoped creation regressions passed on `4a948897`; corrected final-head browser CI and merge pending** |
| H-004 | Medium / P2 correctness | Conference Manager workspace UI | shared-business-domain | PR #173 review: `workspace-application` awaits the operational Manager render and may prepend the business-settings card after navigation has already replaced the Manager root. | Manager renders now own per-render workspace/operational roots and prepend settings only while the root remains current and unlocked. A held-read navigation regression proves that stale completion cannot restore the Manager surface. | **FIXED ON BRANCH — scoped regression passed on `4a948897`; corrected final-head browser CI and merge pending** |
| H-005 | High / rollout security | Customer backend authorization/session | security-relevant | PR #61 review: changing the role-to-permission map did not invalidate already-issued sessions containing old stored permission snapshots. Hash namespacing prevents forward resolution, but legacy unversioned session rows survive; rolling back to the prior binary could resolve an unexpired old cookie and resurrect the superseded snapshot. | API PR #61 adds irreversible schema migration 034 for persistent session revocation, advances the schema baseline to 34, namespaces authority hashes by the security epoch and documents forced reauthentication, CSRF reissue, forward/rollback and emergency operation. Regression coverage proves legacy sessions cannot resurrect across forward or rollback deployment. | **FIXED ON API BRANCH — implementation head `9221ada` green; current paired-head revalidation and merge pending** |
| H-006 | Medium / governance-security | Backend normative authorization docs | Production-relevant documentation | PR #61 review: `TENANT-CATALOGUE.md`, `API.md` and `TENANT-SETTINGS-CONTRACTS.md` still described Catalogue as Tenant Admin + `tenant:configure`. The generic bulk-transfer text also obscured aggregate-specific authorization. | API PR #61 reconciles `API.md`, `TENANT-CATALOGUE.md`, `TENANT-SETTINGS-CONTRACTS.md` and `TENANT-BULK-TRANSFER.md` to the independent/additive role model and aggregate-specific bulk authorization; `TENANT-LOCATIONS.md` defines the field-classified Room/Locations ownership split. API implementation head `9221ada` passed the complete API CI gate; the newer deployment-manifest candidate requires paired revalidation before integration. | **FIXED ON API BRANCH — current paired-head revalidation and merge pending** |
| H-007 | Medium / test-evidence integrity | Production frontend E2E fixture | Production test path | `tests/e2e/production-application.spec.js` issued a `conference_manager` test session whose Manager-specific permissions stopped at `request:manage` beyond the Employee baseline, omitting `tenant:rooms:business:manage` and `tenant:catalogue:manage`. It also replaced a stale literal bootstrap marker instead of following the current immutable cache marker. Later composition assertions still used the former Locations form ID, exposed Room business fields as Tenant Admin edits and expected Tenant Admin Catalogue plus a mixed-ownership Locations rollback. | All Production fixtures now derive the exact bootstrap marker, fail closed on drift and issue the canonical Manager permission projection. Bounded settings fixtures exercise the approved independent ownership model: Tenant Admin owns technical Locations only, Catalogue is absent from that capability, and mixed history remains display-only without a single-role rollback write. | **FIXED ON BRANCH — scoped ownership/session regressions passed on `4a948897`; corrected final-head browser CI and merge pending** |
| H-008 | Low / stale issue debt | Backend documentation backlog | Documentation only | Backend issue #17 still described schema v10 and an older Entra/documentation baseline although, at closure on 2026-09-01, API `main` at `3e42124` documented runtime dependencies and schema 33; SaaS 3.6 PR #61 advances the next baseline to 34. | Revalidated `ARCHITECTURE.md`, `PRODUCTION-SECURE-CONFIGURATION.md` and `pool.js`; issue #17 closed as completed/superseded with comment 5491163193. | Closed |
| H-009 | Medium / governance consistency | Open frontend roadmap/issues | Production-relevant documentation | Older still-open current-state text in #74/#82/#91 assigns Tenant Admin business Room/catalogue maintenance that is superseded by #164/#166. Historical evidence must remain historical, but present-tense ownership is contradictory. | Current-baseline comments now preserve the historical records while explicitly applying Roadmap Approved Version 11 and #164/#166 to all pending work: #74 comment 5495272868, #82 comment 5495273109 and #91 comment 5495273426. The frontend historical/normative documents are corrected in the current candidate and the API normative documents in PR #61. | **CORRECTED ON BOTH BRANCHES — pending integration** |
| H-010 | Medium / security evidence | DAST coverage | security-relevant evidence | The prior `.github/workflows/dast.yml` ran OWASP ZAP Baseline only against the static GitHub Pages launchpad. That result did not constitute Customer Render, Platform Render or Production application/API DAST evidence. | The branch retains the static-portal scan and extends the pinned passive baseline matrix to both public Customer/Platform Render application origins. These scans do not replace authenticated authorization/API or real Production penetration evidence. | **FIXED ON BRANCH — pending final-head three-target DAST, live evidence and merge** |
| H-011 | Medium / security evidence | Code scanning/SAST | Repository-wide | Repository workflows expose custom syntax/static/SAST/architecture checks, dependency review/audit and secret scan; the workflow tree has no standalone CodeQL file because repository default setup owns the scan. | PR #173 head `4a948897` produced successful CodeQL, Actions and JavaScript/TypeScript analysis in addition to the repository gates. Re-run/verify those required checks on the final head; do not misrepresent default setup as a repository workflow file. The separate AI-finding job failed through unsupported scanner-model infrastructure, not a reported code finding. | **PASS ON `4a948897` — final-head rerun required** |
| H-012 | Informational | Source maintenance debt | Repository-wide | The 2026-09-01 marker sweep found legitimate historical/legacy terminology and the documented temporary Manager parity-i18n compatibility bridge, but no new unclassified release-blocking defect after semantic review. | The known bridge remains bounded non-blocking cleanup debt in `ARCHITECTURE.md`: it owns no translations and may gain no consumers. Continue to classify concrete compatibility/dead-code findings semantically rather than using marker counts as a quality metric. | Closed / no release-blocking finding |
| H-013 | High / P1 architecture-failure-path debt | Backend Shared Demo PostgreSQL gate | demo-only reachability; current hardening debt | The still-open review thread on already-merged API PR #58 was revalidated against current `main`: `demo-runtime-gate.js` still owned a second hand-written BEGIN/UTC/COMMIT/ROLLBACK/release lifecycle instead of the canonical `withPostgresTransaction`, so future transaction cleanup/nesting/instrumentation fixes could diverge. Import search shows this gate is used only by Demo Customer/Platform composition and tests, not Production composition. | SaaS 3.6 API PR #61 extends the canonical transaction helper with an opt-in infrastructure-error mapper for `connect`/`setup`/`commit`, preserving work errors unchanged, and makes the Demo gate delegate the full transaction lifecycle to it. Generic and Demo-gate regression tests prohibit lifecycle duplication; implementation head `9221ada` passed the complete API CI gate. | **FIXED ON API BRANCH — current paired-head revalidation and merge pending** |
| H-014 | Medium / static security posture | Static GitHub Pages Demo launchpad | demo-only | The static launchpad set referrer and indexing policy but no restrictive CSP. GitHub Pages also offers no repository-controlled response-header configuration, while CSP `frame-ancestors` is invalid in an HTML meta policy. | Add a fail-closed meta CSP for resource, form, object and base-URL restrictions plus a regression assertion. Explicitly document the provider-controlled response-header/clickjacking limitation; do not claim `frame-ancestors` protection. | **FIXED ON BRANCH — quality passed on `4a948897`; final-head CI, Pages deployment and live evidence pending** |
| H-015 | High / P1 authorization-workflow correctness | Conference Manager Request operations | production-defect / security-relevant | API and frontend review showed that the public cancel transition remained owner-only and the Manager UI exposed neither foreign-Request cancellation nor confirmed-booking proposal, despite the approved Tenant-wide Manager workflow. Broadening Employee or Tenant Admin authority would be an escalation. | API policy grants same-Tenant eligible cancellation only to Conference Manager + `request:manage`, retaining owner-only Employee, independent Tenant Admin, CSRF, audit, state/reconciliation and no-DELETE controls. The frontend now provides accessible cancel and shared confirmed-booking proposal/decision flows. Exact same-Manager audit progression, negative API tests and both-browser evidence remain final-head gates. | **FIXED ON BOTH BRANCHES — API implementation head `9221ada` green; paired-head/browser revalidation and merge pending** |
| H-016 | Medium / cross-browser state consistency | Tenant presentation after Organization write | production-defect | API PR #61 shared-Demo WebKit received Organization PUT 200 but retained the prior brand title; the Production-reachable presentation wrapper could replace a validated mutation with fallback when the bounded follow-up read timed out. | Project the exact validated Organization response immediately into the minimized presentation runtime, invalidate older reads and preserve that newer revision if only the post-save re-read fails. Keep fail-closed fallback for initial/ordinary reads. Unit and Chromium/WebKit shared-Demo evidence are required. | **FIXED ON BRANCH — pending browser CI** |
| H-017 | Medium / authorization audit evidence | Backend booking-change service | security-relevant | Booking-change policy failures and concealed object probes were denied, but the service did not emit the minimized `authorization.denied` evidence used by other Request/settings services. Direct Employee non-owner, Tenant Admin other-user and Conference Manager cross-Tenant propose/decision/change-ID negatives were also absent. | API PR #61 records minimized `authorization.denied` evidence without weakening concealed responses or disclosing target data. Direct policy/service negatives cover Employee non-owner, Tenant Admin other-user and Conference Manager cross-Tenant proposal, decision and change-ID boundaries. | **FIXED ON API BRANCH — implementation head `9221ada` green; current paired-head revalidation and merge pending** |
| H-018 | Medium / P1 correctness | Tenant bulk transfer downloads | production-defect | `bulk-transfer-panel` passed an internally created `blob:` Object URL through the generic navigation sanitizer. The sanitizer correctly rejected the scheme, so template/export anchors had no `href` and silently downloaded nothing. | The generic sanitizer remains fail closed. The shared panel now assigns only its locally created, serialized JSON Object URL to a temporary download anchor, removes the anchor and revokes the URL after activation. Regression coverage verifies exact template/export payloads, filenames, revocation, failure recovery and suppression after the owning view becomes stale. | **FIXED ON BRANCH — pending final-head quality/CI** |
| H-019 | High / P1 correctness and object-boundary integrity | Confirmed-Request current Room context | production-defect / security-relevant | The active application catalogue intentionally omits inactive Rooms/Sites, but a confirmed Request may still reference one. Employee/Manager presentation therefore lacked the authoritative current label/time zone and could not safely offer a replacement without either treating inactive configuration as selectable or broadening the catalogue/configuration projection. Candidate `4a948897` additionally allowed an unresolved Room to reach an `undefined === undefined` fallback match and dereference a null historical context. | The API branch adds the minimized, same-object-authorized `GET /api/v1/requests/{requestId}/room-context` projection with exact Request reference, `locationsRevision`, current Room/Site presentation fields and no price/provider/mutation authority. Frontend validation correlates Request identity/schema/version/status, Room ID and Locations revision, performs at most one bounded catalogue/context refresh, renders inactive current context disabled and permits only active catalogue Rooms. The shared timezone helper now requires an actual Room before historical Site matching; missing/malformed/incoherent context returns unavailable and fails closed. | **FIXED ON BOTH BRANCHES — API implementation head `9221ada` green; paired-head/browser revalidation and merge pending** |
| H-020 | High / P1 data integrity | Confirmed-booking proposal concurrency | production-defect | The frontend previously reloaded the Request immediately before POST and used that newly read version as `expectedVersion`, while the proposal draft still came from the older Request displayed to the User. A concurrent change could therefore advance the token and be silently overwritten by stale displayed fields instead of producing a conflict. | `proposeBookingChange` now requires the displayed validated Request version explicitly, performs no preflight Request read and sends that exact value as `expectedVersion`. The shared editor passes `request.version`; contract tests require the single exact POST and reject an invalid token before transport. The backend remains authoritative and must reject a stale version. | **FIXED ON FRONTEND BRANCH — pending final-head quality/CI and browser evidence** |
| H-021 | High / P1 data integrity and workflow reachability | Aggregate-scoped Tenant bulk transfer | production-defect | After SaaS 3.6 ownership reassignment, bulk presentation remained under Tenant Admin and was mounted only for Cost Allocation: Conference Manager Room/Catalogue and Tenant Admin Locations aggregates had no UI surface. The old asynchronous panel could also let an older validation completion replace a newer receipt, then pair the old document/receipt with the currently selected type, and could download/announce/rerender after navigation or inactivity lock. | The panel is now capability-neutral Shared presentation. Conference Manager injects `rooms` plus Catalogue aggregate types; Tenant Admin injects `sites`/`rooms` and `cost-centers`. A monotonically invalidated validation generation and captured type/file/document/receipt bind Apply to the exact latest validation, validation is disabled while Apply is pending, and view/DOM/lock lifecycle checks suppress stale completions. Aggregate authorization, revisions and receipt verification remain server-side. | **FIXED ON FRONTEND BRANCH — pending final-head quality/CI and Chromium/WebKit evidence** |
| H-022 | High / P1 async state integrity | Employee create/repeat/resubmit editor | production-defect | Overlapping editor renders shared one mutable catalogue and consumed the queued repeat/resubmission intent only after an unguarded catalogue await. A detached older render could therefore consume the current intent, replace newer catalogue state, save a stale draft or navigate/show success after its surface had been replaced or locked. | Editor invocations now use a monotonic generation, current-root/lock guard and immutable per-render catalogue snapshot. Only the current successful render may commit the catalogue or consume the queued intent; draft, availability and submit continuations suppress all detached effects. Static and deterministic held-read browser regressions cover the boundary. | **FIXED ON FRONTEND BRANCH — pending final browser CI and merge** |
| H-023 | Medium / workflow concurrency | Employee confirmed-booking proposal | production-defect | Proposal pending state was dialog-local. Refreshing Requests while a proposal POST was held created a replacement card whose Change action could start a second dialog/POST for the same Request, producing avoidable optimistic-concurrency conflicts and incoherent recovery UX. | The application-level per-Request coordinator now reserves the Request through context preparation, dialog lifetime and POST settlement. Replacement projections disable all competing mutations; cancellation, success and stale preparation release only their own reservation and reconcile through the current Requests surface. A held-POST/refresh browser regression proves one wire mutation. | **FIXED ON FRONTEND BRANCH — pending final browser CI and merge** |
| H-024 | Medium / exact transport contract | Booking-change decision adapter | production-defect / defensive boundary | The exported adapter allowed reject without a reason and approve with an arbitrary reason, leaving invalid wire shapes to the backend even though the UI currently called the adapter correctly. | The adapter now sends exact approve intent only when no reason is supplied, and exact reject intent only with a trimmed 1..1000-character reason. Unsupported/expanded intent fails before transport; contract tests cover both exact bodies and every no-transport negative. | **FIXED ON FRONTEND BRANCH — local contract/full quality green; pending merge** |
| H-025 | High / privileged async lifecycle and focus integrity | Tenant Admin settings mutations | production-defect / security-relevant | Conflict reapply callbacks loaded a fresh revision and then could issue a second privileged PUT after navigation or session lock. Locations save completion could also emit stale global feedback after its owning section detached. The first post-save focus render consumed its shared intent before a presentation-driven replacement render, losing required focus. | Organization, Booking Policies and Cost Allocation capture the exact submitted draft in the initiating handler, re-check the owning generation before every reapply PUT and suppress detached completion effects. Locations serializes mutation intent and suppresses detached success/failure presentation. Focus intent remains pending until the newest current, connected heading consumes it. Static lifecycle assertions plus held-read/save Chromium/WebKit regressions protect the boundary. | **FIXED ON FRONTEND BRANCH — local full quality 400/400 green; pending final-head browser CI and merge** |

## Current scanner and CI evidence

Evidence is recorded by exact head because a later branch commit invalidates assumptions about a
previous head.

### Frontend head `1ca39e5bc93893a6e73ed5385248a5e9a0c16fef`

- `quality`: success, including high-severity dependency audit and repository syntax/SAST/secret/
  architecture/regression checks;
- Secret Scan: success;
- Dependency Review: success;
- Hosted Demo Acceptance: success;
- shared-Demo E2E: success against the pinned API commit;
- full browser E2E was still running when this register snapshot was created and must be re-evaluated
  on the final post-fix head.

### Backend head `aa266ad87ec41dfb418822a34420521b8df1409c`

This head includes the Customer-session security epoch, Catalogue/Bulk authorization documentation,
and the H-013 canonical transaction-helper correction. Dependency Policy and Secret Scan passed on
this exact head; the complete CI workflow was still running when this register snapshot was updated.
Earlier code head `4f92cc122feb08a6092fc064bdc9a7cdca7a7e81` passed `quality`, PostgreSQL integration
and shared-Demo Chromium/WebKit, but that earlier evidence is not treated as final-head validation.

Passing configured jobs does not substitute for the unresolved DAST/CodeQL evidence questions
listed above and does not close open review findings.

### Backend head `9221ada40b8a65dcf243d664c2e87241dce7083d`

The complete API CI gate is green on this API PR #61 head. That exact-head result covers the H-005
irreversible session-revocation correction and H-017 minimized authorization-denial audit/negative
boundary corrections. Both findings remain pending until the reviewed head is integrated into
`main`; a green branch does not by itself satisfy the milestone integration rule.

### Backend candidate `bbc62f1b2f5f9e4f9411fb5ca126c79619b0c6f8`

This newer candidate changes only the deployment manifest to pin frontend candidate `4a948897`.
Its quality, PostgreSQL integration, Dependency Policy and Secret Scan jobs passed. Both shared-Demo
matrix jobs failed through the paired frontend defects classified below, so this head is not treated
as a green final API candidate and must be repinned and revalidated against the corrected immutable
frontend head.

### Post-`4a948897` SaaS 3.6 correction state

Frontend candidate `4a948897ff54918bf654c43ef3e53d9824dbf8ac` passed `quality`, Secret Scan
and Dependency Review, but full E2E failed 24 of 142 mirrored cases and both shared-Demo matrix jobs
failed; Hosted Demo Acceptance also failed against the unchanged live deployment refs. Twelve
mirrored failures shared one null-unsafe unresolved-Room timezone fallback, while
the Organization save focus failure exposed a detached-render race. The remaining assertions used
superseded status/navigation labels, an invalid disabled-option matcher, or the former mixed
Tenant-Admin Catalogue/Locations ownership model. The correction worktree centralizes and guards
the timezone fallback, preserves mutation focus only for the newest connected section render and
aligns the browser evidence with the approved independent role/ownership boundary.

The complete correction candidate passed `npm run check` with 400/400 Node tests and
`npm audit --audit-level=high` with zero vulnerabilities. Playwright discovery lists 146 tests
across the Chromium desktop and WebKit mobile projects, including 84 Production-application cases.
The current local environment has no usable Playwright browser binaries, so it cannot execute those
cross-browser cases; the attempted local execution failed only because the managed Chromium binary
is absent and is not recorded as product evidence.

Before closure, the final committed frontend head must pass the repository quality/audit gates and
the required browser CI. The shared-Demo CI checkout is pinned to API code head
`9221ada40b8a65dcf243d664c2e87241dce7083d`, whose complete API gate is green; H-019 additionally
requires final backend integration. Earlier green jobs, local discovery or local non-browser tests
do not substitute for exact-head GitHub and hosted evidence.

## Issue/review inventory rules

- SaaS 3.6 roadmap issues #164-#172 are work packages, not defects by themselves.
- External-acceptance SaaS 1 issues remain external evidence work unless a current repository defect
  is independently reproduced.
- Historical SaaS 2/3 roadmap language is preserved as historical evidence; contradictory present-
  tense ownership must receive a clear superseded/current-baseline note under #169.
- Backend issue #17 was the only open backend issue in the 2026-09-01 issue sweep and is now closed
  because its stated documentation gap is already satisfied by current main.
- Historical merged PR review threads are part of the inventory. A merged PR summary does not
  override an unresolved review finding: H-013 was rediscovered this way and reproduced on `main`.
- PR review findings are first-class hardening findings and are resolved only after fix + appropriate
  regression/progression/negative evidence.

## Remaining mandatory hardening work before #170

1. Commit and integrate API PR #61 and frontend PR #173 without bypassing required review, branch
   protection, CodeQL, dependency, secret, quality, browser, shared-Demo, hosted or DAST gates.
2. Record exact-head CI evidence for H-001/H-003/H-004/H-005/H-007/H-010/H-011/H-013 through H-025;
   earlier branch or local evidence cannot close a final-head gate.
3. After API integration, resolve the historical PR #58 transaction-duplication thread with the
   replacing merge evidence and verify migration 034/session revocation on `main`.
4. Reconcile #169 GitHub and Confluence current-state documentation to the actual merged frontend/API
   refs while preserving historical roadmap evidence.
5. Execute and record the external hosted launchpad/Render/DAST acceptance required by #172 and #170.
   Repository implementation must not self-approve that evidence.
6. #170 remains open until the register has no unresolved blocking finding and every required gate
   applies to the exact release-candidate refs; #164 and SaaS 4 remain blocked until that gate passes.

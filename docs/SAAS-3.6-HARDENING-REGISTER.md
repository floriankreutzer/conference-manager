# SaaS 3.6 hardening register

Status date: 2026-09-26
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
| H-010 | Medium / security evidence | DAST coverage | security-relevant evidence | The prior `.github/workflows/dast.yml` ran OWASP ZAP Baseline only against the static GitHub Pages launchpad. That result did not constitute Customer Render, Platform Render or Production application/API DAST evidence. | The branch retains the static-portal scan and extends the controlled passive baseline matrix to both public Customer/Platform Render application origins. These scans do not replace authenticated authorization/API or real Production penetration evidence. | **FIXED ON BRANCH — pending final-head three-target DAST, live evidence and merge** |
| H-011 | Medium / security evidence | Code scanning/SAST | Repository-wide | Repository workflows expose custom syntax/static/SAST/architecture checks, dependency review/audit and secret scan; the workflow tree has no standalone CodeQL file because repository default setup owns the scan. | PR #173 head `4a948897` produced successful CodeQL, Actions and JavaScript/TypeScript analysis in addition to the repository gates. Re-run/verify those required checks on the final head; do not misrepresent default setup as a repository workflow file. The separate AI-finding job failed through unsupported scanner-model infrastructure, not a reported code finding. | **PASS ON `4a948897` — final-head rerun required** |
| H-012 | Informational | Source maintenance debt | Repository-wide | The 2026-09-01 marker sweep found legitimate historical/legacy terminology and the then-documented temporary Manager parity-i18n compatibility bridge, but no new unclassified release-blocking defect after semantic review. | The current frontend integration removes that bridge and the other module-graph-proven unreachable Employee/Manager render chains, and its architecture gates prohibit those runtime roots from returning. Continue to classify compatibility/dead-code findings semantically rather than using marker counts as a quality metric. | **CLOSED ON LOCAL FRONTEND CANDIDATE — exact-head CI and integration review pending** |
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
| H-025 | High / privileged async lifecycle and focus integrity | Tenant Admin settings mutations | production-defect / security-relevant | Conflict reapply callbacks loaded a fresh revision and then could issue a second privileged PUT after navigation or session lock. Locations save completion could also emit stale global feedback after its owning section detached. The first post-save focus render consumed its shared intent before a presentation-driven replacement render, losing required focus. | Organization, Booking Policies and Cost Allocation capture the exact submitted draft in the initiating handler, re-check the owning generation before every reapply PUT and suppress detached completion effects. Locations serializes mutation intent and suppresses detached success/failure presentation. Focus intent remains pending until the newest current, connected heading consumes it. Static lifecycle assertions plus a deterministic held-revision-read Chromium/WebKit regression protect the boundary. | **FIXED ON FRONTEND BRANCH — local full quality 400/400 green; pending final-head browser CI and merge** |
| H-026 | High / P1 data integrity | Conference Manager Room-price administration | production-defect | PR #174 review: the Manager Catalogue UI materialized a missing sparse `roomPrices` entry as zero and serialized it on an unrelated save, which could convert an unpriced Room into an explicitly free/bookable Room. | Missing prices now render as an optional blank amount with a dormant default currency and remain omitted from the exact write projection. Explicit user input, including zero, creates the price intentionally; configured prices remain required. Pure projection and Chromium/WebKit browser regressions distinguish absence, explicit zero and unrelated Catalogue edits. | **FIXED ON FRONTEND BRANCH — focused model/i18n/syntax checks green; final-head quality/browser CI and merge pending** |
| H-027 | Medium / P2 accessible validation | Conference Manager Room/Catalogue names | production-defect | PR #174 review: native `required` accepted whitespace-only names; trimming then delegated an empty value to the adapter and surfaced only a generic toast without field association or focus. The same pattern existed for Catalogue entries and package variants. | One bounded Manager-settings validator now rejects empty-after-trim values before transport, associates localized live errors through `aria-describedby`, sets `aria-invalid`, focuses the first invalid control and clears feedback on input. Browser regressions cover Room and Catalogue names; variants share the same helper. | **FIXED ON FRONTEND BRANCH — focused i18n/syntax checks green; final-head quality/accessibility/browser CI and merge pending** |
| H-028 | Medium / security logging | Shared-Demo CI generated credentials | security-relevant CI evidence | Final API review found that generated session, CSRF and audit-HMAC secrets were written to `GITHUB_ENV` without first being registered as GitHub Actions masks. Later Shared-Demo step environment blocks therefore displayed those ephemeral runner-only values in clear text. No persistent or externally authorized credential was involved, but the output violated the mandatory repository secret-logging policy. | API PR #62 now centralizes GitHub command-file serialization, registers four complete database URLs, five generated application secrets and four raw database-role passwords before database access or environment propagation, escapes GitHub workflow-command data and rejects environment-command injection. Three adversarial unit tests cover mask ordering, deduplication, encoding and fail-closed environment serialization. On final security candidate `4cbb660`, every one of the nine propagated environment names appeared 5/5 times masked and 0 times unmasked in each browser job; complete-log inspection found no raw URL prefix, generated-secret shape or partial assignment. | **FIXED ON API INTEGRATION CANDIDATE `4cbb660` — CI `33537857311`, Dependency Policy `33537857101` and Secret Scan `33537857180` green; final deployment-pin-only successor and merge pending** |
| H-029 | Medium / governance, supply chain and integration | API target-branch dependency guard | repository integration defect | While PR #62 was under final review, API `main` merged Dependabot PR #49 and advanced `@azure/msal-node` from 5.4.3 to 5.6.0, but the repository architecture allowlist remained pinned to 5.4.3. The first masking-fix head therefore exposed a deterministic current-`main` architecture-gate failure; it was not an infrastructure failure and could not be bypassed. | API PR #62 was forward-integrated with exact current `main` `c811b7e`, retaining its package and lockfile while synchronizing the explicit architecture allowlist to the approved installed version 5.6.0. Independent review found no new package, license, engine, lifecycle-script or known-vulnerability blocker. Candidate `4cbb660` passed architecture, unit/API, HTTP-security/DAST, PostgreSQL, both-browser Shared-Demo, dependency and secret gates. | **FIXED ON API INTEGRATION CANDIDATE `4cbb660` — exact current-main CI green; final deployment-pin-only successor and merge pending** |
| H-030 | Medium / security-control integrity; Low / deployed header | Public Demo DAST workflow and Render shells | security-relevant evidence | Scheduled run `34207782850` exposed that the three-surface ZAP job scanned Render without a cold-start readiness gate and had no reviewed passive-alert policy. The first attempt timed out on both sleeping Render services; after an explicit wake, all surfaces completed with zero ZAP FAIL alerts but the action failed on known warnings. The review separated provider-controlled Pages responses, intentional Render `no-cache`/header-plus-meta CSP behavior and ZAP's missing Fetch Metadata request headers from one repository-actionable Low: both Render shells lacked `Cross-Origin-Embedder-Policy`. A permanently red control cannot be represented as usable release evidence. Failed candidate run `34257529823` then proved that suffixed alert references cannot be passed directly to the plugin-ID-based baseline summary: it generated alert filters, duplicated findings and synthetic zero-instance rows instead of preserving raw evidence. | The workflow checks out reviewed policy without persisting credentials, waits for direct HTTP 200 at surface-specific readiness URLs and generates the exact Automation Framework plan before the scan. Exact-policy rows are mechanically limited to one canonical HTTPS URL. An unsuffixed plugin-ID `INFO` compatibility map is a deterministic finite-URL projection, not a ZAP filter. The always-run validator requires one fresh unfiltered raw report and the exact ordered seven-job plan; it binds every instance to the reviewed reference, URL, method and maximum risk and binds generated summary rules to the projection. Unknown plugins, sibling references, changed URLs/risks and filtered, stale, early or wrong-origin evidence remain validator-blocking. Broad ignores, wildcard exclusions and warning-tolerant execution are prohibited. The plan uses `maxAlertsPerRule: 0`, so findings cannot be suppressed by a per-plugin ceiling. The API correction adds and tests `Cross-Origin-Embedder-Policy: require-corp` on both Demo shells. A trusted `main` push touching the DAST policy triggers all three live scans so the correction and durable Pages source receive post-merge evidence. | **CORRECTION IN PROGRESS — corrected pull-request gate, protected merge and green trusted-main three-surface DAST evidence required** |
| H-031 | Medium / P1 recovery correctness | Customer Demo Tenant/persona control | demo-only | During hosted acceptance, selecting the server-known Contoso Tenant while it remained in lifecycle state `ready` correctly denied active-only business projections with HTTP 403. The application then discarded the effective business session as required, but the Demo selector was coupled to that same session and became unusable, trapping the User in the unavailable Tenant. Production has no Demo Tenant/persona selector. | Frontend PR #175 preserves the initially validated server-backed session only as a Demo control-session snapshot while the Demo runtime still reports `authenticated`. That snapshot can display the selected Tenant/persona and submit the existing bounded context-switch intent; it never restores User, role, permission, business persistence or application authentication authority. Unit and Chromium/WebKit regressions enter the denied Tenant, require the application to remain unavailable, and recover to the active Tenant. API PR #64 pins the corrected immutable frontend for both Render services. | **CLOSED — frontend PR #175 merge `456a8137ef26dca1e18298a36565d0dc0f6e50ef`; API PR #64 merge `f75a940bc1c589f4f91e3a534539b5eb58c346a9`; recovery CI `34192640969` and exact deployed-release acceptance `34193819829` green** |
| H-032 | High / P1 security-evidence integrity | Exact DAST raw evidence | security-relevant evidence | PR #189 review found that upstream Baseline generation set `maxAlertsPerRule: 10`. ZAP applies that ceiling to the base passive scanner plugin, so later URLs can be suppressed before the raw report reaches the exact verifier; Platform plugin `90005` reached that boundary in live evidence. Later reviews found that a path target did not itself prove a subtree restriction, same-origin evidence outside that subtree remained verifier-acceptable, an existing evidence-path symlink could defeat the intended narrow bind mount, and the direct Automation Framework start had dropped the wrapper's `-a` alpha passive rules. | The workflow now generates and validates its exact seven-job Automation Framework plan in the repository with `maxAlertsPerRule: 0`, explicit `90004`/`90005` thresholds, an exact target-subtree context include and an explicitly context-bound spider. The verifier independently rejects policy and report URLs outside that subtree. In the same container home it installs beta and alpha passive add-ons, records the installed manifest, and refuses evidence unless both expected rule sets are proven. Before the container starts, the workflow removes the exact evidence path without following links, recreates a real directory and verifies its resolved location; the container mounts only that directory rather than the repository tree. | **FIXED ON BRANCH — pending exact-head three-target DAST, fresh security review and merge** |
| H-033 | High / P1 Unicode presentation integrity | Request attribution API and frontend wire | production-defect / security-relevant | The attribution `displayName` wire accepted bidirectional overrides/isolates, zero-width and other Unicode format/control characters. A visually reordered or concealed actor label can misrepresent who performed a Request operation even when the underlying audit identity remains server-owned. | The frontend wire requires trimmed NFC text and rejects Unicode control, format, surrogate, line-separator and paragraph-separator categories before rendering. API Guest hardening `49a8e9a` also rejects lone surrogate code points before persistence and response. Paired negative contract tests exist locally; exact paired-head remote execution and review remain required. | **CORRECTED LOCALLY ON THE FRONTEND AND API CANDIDATES — exact-head paired CI, review and integration pending** |
| H-034 | High / P1 functional contract and asset trust boundary | EMP-03 Room media | production-defect / security-relevant | The frontend reduces opaque `floorplanAssetId`/`mediaAssetIds` values to presence/count and renders synthetic CSS schematics; its browser fixture explicitly proves that no asset request occurs. The API stores opaque identifiers in Room JSON but has no asset registry, bytes, authenticated upload or byte-delivery/resolution contract. This does not satisfy the approved EMP-03 image, preview and floorplan requirement. | ADR-012 accepts bounded PostgreSQL raster assets, Tenant quota, image processing, Room-reference lifecycle and same-Tenant read/upload authority. Implement the same-origin managed-asset contract with authorization, content-type, size, cache and failure bounds and no arbitrary URL/SSRF authority, plus API and Chromium/WebKit negative and visual coverage. Verify backup/retention cost and recovery before release. A placeholder URL or ID alone is not a delivery contract. | **PRODUCT DIRECTION ACCEPTED — implementation and evidence still block #182 and #170** |
| H-035 | High / P1 public-content boundary | Site Guest and Request Room Guest text | production-defect / security-relevant | The initial credential-label screen missed voucher/Wi-Fi/passcode/token labels and Room floor/accessibility, including legacy stored details. Adversarial review found obfuscated, suffixed and non-Latin credential labels; broad script rejection also blocked legitimate multilingual wayfinding. More fundamentally, free text can disclose a code without any label (for example, “The combination 1234 opens the door”), which no finite label detector can prove absent. | FE `f4d68ee` and API `8a0714c` apply bounded candidate-based screening and raw/full/separator-preserving skeleton passes. Paired tests reject reproduced glued/numeric/prefix/Latin/Cherokee and `@/$` plus leet patterns, preserve Cyrillic/Japanese/mixed-script wayfinding and `passwordless` semantics, and cover the Unicode normalization hot path; the Room-specific non-Markdown contract remains. ADR-012 accepts credential-incapable structured public values and withholding of unmigrated Guest prose. Existing Site/Room names are older v1/Catalogue/Provider fields; owning-role content policy and inherited-risk review remain necessary. Contact email/phone remain bounded strings, not new RFC/E.164 contracts. | **PRODUCT DIRECTION ACCEPTED — structured contract, migration and PostgreSQL/browser/CI evidence pending** |
| H-036 | High / P1 Request response integrity | Frontend Request adapter | production-defect / security-relevant | A validly shaped mutation/proposal response could silently confirm different Room, time, participants, title or configuration than submitted; Request attribution could downgrade between separate API calls; report rows updated after `asOf`, booking-change `change:null` with a foreign version, and transition responses with a different status/version/reason could look successful. | Frontend `4af7c23` binds full submitted draft and proposal snapshots, visible Request references and transition intent/version, latches v3 attribution across endpoint families, checks report `updatedAt <= asOf`, and sends a strong visible-version `If-Match` on transitions. Adversarial responses remain independently wire-valid in the negative tests; API H-038 supplies the complementary server precondition. | **FIXED LOCALLY — exact paired CI/browser evidence pending** |
| H-037 | High / P1 session authority lifetime | Customer shell and Employee/Manager/Tenant Admin subviews | security-relevant | 401/403 from Notifications, Settings, Tenant Admin, bulk, presentation, sign-out, Demo Tenant/persona switch and detached/late feature calls could be swallowed by local lifecycle catches while privileged navigation/profile/dialogs remained live. A queued Profile→Help frame could reopen a dialog after invalidation. | Frontend `3899aac` adds central context invalidation of session, capabilities and cached projections; shell closes dialogs/print, clears navigation/feedback and renders a focused sign-in status. Successor `8656dd1` also resets external branding/title/localization and prevents a late presentation refresh from reapplying tenant identity. Held-call/navigation/save/logout regressions are present; final local quality passed 457/457, browser discovery is not execution. | **FIXED IN LOCAL FRONTEND CANDIDATE — exact-head browser CI, review and integration pending** |
| H-038 | High / P1 stale workflow mutation | Backend Request transitions and confirmation | production-defect / security-relevant | Transition POST had no visible Request-version precondition. After another actor changes and resubmits a Request into an allowed status, a stale Manager command can mutate unseen content; frontend response checking detects the mismatch only after a database/provider/calendar side effect. The repository compare-and-set checked status but not Request version, and already-target reconciliation could accept another operation as success. | Frontend `4af7c23` sends one strong decimal `If-Match` tag for the displayed positive version. API `3790d68` requires it (428 missing / 400 malformed), checks before policy/provider/calendar activity and atomically under status+version compare-and-set in transition and confirmation writes. Successor `d5203d1` fails closed on a predecessor-version retry because target/reason/version cannot prove the same actor and operation without an operation identity; `f544211` prevents one ambiguous confirmation path from adopting/compensating a winner's event. An already-terminal command can only reread the exact current version under its command entitlement. ABA, same-status races, confirmation/no-orphan, stale/retry, malformed-header and PostgreSQL-negative coverage were added. Deploy the compatible frontend first; H-040 provides the complementary provider-event fence. | **FIXED LOCALLY — H-040 PostgreSQL 18 and exact paired browser/CI evidence pending** |
| H-039 | High / P1 command authorization | Already-confirmed Request retry | security-relevant | An Employee who may read their own already Confirmed Request could submit the `confirm` command with the predecessor version and receive a success-equivalent response despite lacking the Manager `request:manage` entitlement; the confirmation service's already-target branch used read authorization. A direct transition correctly denied that same principal. | API `d5203d1` requires Manager `request:manage` reconciliation authority even on already-Confirmed state and fails predecessor-version commands closed; real-policy and HTTP Employee-denial/Manager-current-version tests are included. | **FIXED LOCALLY — 786/786 API gates passed; PostgreSQL 18/exact-head evidence pending** |
| H-040 | High / P1 booking-provider race | Concurrent final confirmation and compensation | production-defect / security-relevant | Two final confirmations can share a deterministic provider event. A losing Room-compare-and-set compensation or a concurrent write-disabled pre-confirmation cleanup could delete that event before the write-enabled winner commits, leaving Confirmed without a live Calendar event. A held repro observed `providerEventActive=false` after winner success. | API `88dd4a0` fences compensation with the Request row, active reference and per-reference advisory lock. `f508b47` adds a dedicated version/status-fenced pre-confirm cleanup: `active→compensating→compensated` before the external Delete; after Room check the successful Confirm atomically records Request revision, cleanup/audit and `compensated→cancelled`. `e71b8e2` canonicalizes Revision-Watermark→Tenant-Audit lock order across all six Request writers, including pending-change supersede. Held unit races and barrier-based two-client PostgreSQL tests for both provider orderings and both tenant-wide advisory contention paths are committed, but the latter were not executed without PostgreSQL 18. Ordinary cancellation remains separate. | **FIXED LOCALLY — two-client PostgreSQL 18/provider integration, exact-head CI/review and deployed evidence required** |

### Current repository-controlled disposition

ADR-012 (`ADR-012-SAAS36-ROOM-MEDIA-AND-GUEST-PUBLIC-CONTENT.md`) accepts the H-034/H-035
product direction. The managed-media and structured-public-content implementations and
their operational, security and acceptance evidence remain open.

The branch-progress wording in the earlier status cells is historical. The last fully
browser-executed frontend draft PR #201 head was `5b47eb6bd544dac6fbfdebc14768f4fa005f4f96`;
its successor includes the nested-form correction and this evidence update. API draft PR #78 points to
`8c40290ae984433b8a69a7ef13ce842dea64c50e`. The frontend integrates Employee/Manager,
Equipment, attribution, Guest, H-036 response binding and H-037 authority invalidation.
The API candidate includes schema 38, H-038/H-039/H-040, known-label correction and
a bounded H-034 image-decoding/re-encoding adapter.
The adapter accepts PNG/JPEG/WebP up to 2 MiB and 4 megapixels, rejects format mismatch
and animation, and emits metadata-free WebP. API `npm run check` (788/788 tests) and
`npm run audit` (0 vulnerabilities) passed locally on 2026-09-26. API exact-pair CI
`36265393728` passed its quality, PostgreSQL 18 migration/persistence/concurrency and
shared-Demo browser jobs against the pinned frontend candidate of that run. Asset persistence,
Tenant quota, attachment authorization, delivery and real frontend rendering do not yet exist.
These are draft PR candidates, not final merged or deployed release references.

- The PR candidates contain the restored Employee, Manager, Equipment, attribution and Guest
  Information implementations, but H-034 remains an unresolved repository-controlled EMP-03 gap.
- H-033/H-036/H-037/H-038/H-039/H-040 and known H-035 label bypasses have candidate fixes;
  the API two-client PostgreSQL 18 tests ran in CI `36265393728`, but H-035 remains open for
  structured public values and inherited-field risk acceptance. No finite label scanner proves
  unlabeled secrets absent. Protected review, final deployment and human acceptance remain absent.
- FE CI `36269943540` passed quality/shared PostgreSQL Demo but failed two of 262
  Chromium/WebKit cases (one mirrored Manager 320px form-reflow cause). The subsequent
  frontend candidate constrains the nested Manager form track; exact-head CI is pending. API PR #78's
  `render.yaml` still pins older frontend `7b17a2c`; a passing CI pair is not a deployed pair.
  Render Customer and Platform Demo are both still live on API `62f8e5857dffefa789d1db573ecfd1222b188246`
  (deploys `dep-daiq043m8hqs73driar0` and `dep-daipqqvqj5pc73b3t9vg`, 12 September 2026).
  The release must
  use an ordered compatibility handoff and record the exact pair through workflow inputs and
  post-deployment identity; reciprocal commit-SHA pins cannot be fabricated as a hash cycle.
- Draft PR publication and green candidate jobs are not release evidence. Protected review,
  merges, deployments and Production migrations must follow the configured release workflows.
- The public readiness markers remain `in-validation`; #182, #170 and the SaaS 3.6 milestone remain
  open until H-034/H-035 and all outstanding H-040 external evidence, exact-head, deployment and
  human-acceptance gates below are complete.

## Current candidate evidence

| Candidate | Local state | Evidence still required |
| --- | --- | --- |
| Frontend | Draft PR #201; preceding executable head `5b47eb6b` had exact-pair CI `36269943540`: quality/shared Demo green, 260/262 browser cases passed; nested Manager form correction pending CI | Green exact-head full browser matrix and protected review; H-034/H-035 real UI |
| API | Draft PR #78 `8c40290a`, schema 38; exact-pair CI `36265393728` passed quality, PostgreSQL 18 and shared-Demo browsers | H-034/H-035 implementation with new database/browser evidence, protected review and deployment |
| Paired release | Immutable CI pair available; live Customer/Platform Demo still on API `62f8e585` from 12 September | Reviewed compatibility-first handoff, exact deployment identities, protected review/merge, Hosted Acceptance and live three-surface DAST |
| Product acceptance | Readiness is `in-validation` | Implement accepted ADR-012 managed media and structured public values; named human #182 acceptance for keyboard/focus, 200% reflow, responsive states, dialogs, print and real Room media |

Local Node checks remain candidate diagnostics. Chromium/WebKit and PostgreSQL 18 evidence above
is limited to the exact named CI runs; it cannot validate newer heads, missing product contracts,
actual Render deployments or human acceptance. Record the final documentation successor SHA
and its executed remote results before integration.

The REG-01/02/03 browser titles now identify existing authorized Tenant Admin, Manager-absence and
dual-role journeys. `e3d55a5` adds direct Tenant Admin entry, reload and Demo role-loss coverage;
`ead50a7` adds Production reload role-loss and dual-role/Manager-absence checks. These cases ran
on the prior PR head in both browser engines. Residual role-gate evidence is still required for other
direct/deep entry and reload, live stale-capability removal after a Production role change, the
complete Manager report/Room-price absence matrix and same-Tenant non-owner Request access.
Backend authorization negatives remain complementary and do not substitute for those browser outcomes.

## Historical scanner and CI evidence (superseded for current candidates)

The exact results below remain useful audit history for the SHAs they name. They do not validate
the final frontend documentation successor, API `8c40290a` or their pairing.

### Historical frontend executable candidate `de3dd11404ee5ebab5252b3b98e957b091827651`

- CI run `33534092470`: `quality` passed with 401/401 Node tests and zero high-severity dependency
  vulnerabilities; Chromium desktop and WebKit mobile passed 146/146 browser tests; shared-Demo
  Chromium/WebKit passed 2/2 against API implementation `550cc0f`.
- Dependency Review run `33534092513` and Secret Scan run `33534092502`: success.
- CodeQL run `33534086466`: Actions and JavaScript/TypeScript analyses succeeded.
- Two independent reviews of the executable diff found no remaining concrete implementation,
  accessibility, security, data-integrity, i18n or regression defect.
- Hosted run `33534092495` exercised the intentionally unchanged live deployment refs
  (`07f2896` / `3e42124`) and failed because that old Customer Demo lacks `dual_role`. Bounded reset,
  cleanup and deployment-identity stability completed; evidence artifacts are `9811041885` and
  `9811043081`. This is diagnostic evidence for the pending external rollout, not external
  acceptance evidence or a failure of the immutable candidate.
- Optional AI run `33534089780` failed before analysis because the configured model is unsupported;
  it reported no code finding and is not a required repository gate.

### Historical frontend documentation candidate `e76a3d95aee249083511db82aab651e4edfc44c3`

- This candidate preserves executable tree `05dcb6c9754d8dc5026cc85f2ba8e109fc26b25e` from the final
  executable candidate and changes only milestone evidence documentation.
- CI run `33535519839` passed with 401/401 Node tests, 146/146 Chromium/WebKit tests and 2/2
  Shared-Demo journeys. Dependency Review `33535519934`, Secret Scan `33535519859` and default-setup
  CodeQL `33535515092` also passed.
- Hosted run `33535519864` again exercised the intentionally unchanged live deployment refs and
  failed only because the old live Customer Demo lacks `dual_role`; cleanup and identity validation
  succeeded. Evidence artifacts are `9811582791` and `9811583506`. This remains rollout diagnostics,
  not external acceptance evidence.
- The current documentation-only successor adds H-028/H-029 disposition and must repeat applicable
  exact-head gates before integration.

### Historical API implementation evidence

- API implementation `550cc0f1264085631c67f8a6465ac276e0af2ae0` contains the locked
  revision/authorization correction. Paired candidate `613a740b7f5e02f6517e26d3c97fe4f060c91fe3`
  passed CI run `33531678664` (718/718 quality tests, 16/16 platform HTTP-security/DAST checks,
  86/86 PostgreSQL checks and shared-Demo Chromium/WebKit), Dependency Policy `33531678648` and
  Secret Scan `33531678675`.
- Integration PR #62 is the integration surface for the final rollback-negative coverage,
  documentation correction, CI-secret redaction, target-branch dependency reconciliation and exact
  deployment pin.
- Rollback-negative unit/PostgreSQL coverage and contract-sequence reconciliation were completed on
  `7fa72d03cb78a9ad9e7d1ebb94d59f72b15a4afd`; its CI run `33535706698` passed 721/721 unit/API,
  16/16 Platform HTTP-security/DAST and 86/86 PostgreSQL checks plus both browser journeys.
  Candidate `4cbb660` preserves those changes.
- Current security/current-main candidate `4cbb6600398e1db56bd9dd2de130502844cec258`
  passed CI run `33537857311`: 724/724 unit/API tests, 16/16 Platform HTTP-security/DAST checks,
  86/86 PostgreSQL checks and one complete Shared-Demo journey in each of Chromium and WebKit.
  Dependency Policy `33537857101` and Secret Scan `33537857180` also passed. In each browser log,
  all five generated session/CSRF/HMAC variables and all four propagated database-URL variables were
  masked in every one of five later environment displays, with zero unmasked or partially masked
  assignments and no raw Demo database URL prefix or generated-credential-shaped value elsewhere.
- The first redaction head `4ac6e9e1b684c6d8ee43dc641a1b79183ca84864` exposed a deterministic
  current-`main` mismatch after Dependabot PR #49 upgraded `@azure/msal-node` to 5.6.0 without
  updating the explicit architecture allowlist. Candidate `4cbb660` forward-integrates exact API
  `main` `c811b7e6064e56b2a634a758b191ad8c26b121a1` and synchronizes that guard; the full exact-head
  gate above proves the correction. The final deployment-pin-only successor must pin this register's
  final frontend documentation head and repeat its exact-head validation. Only that final green
  evidence may supersede `4cbb660` without changing the approved authorization architecture.

### Historical intermediate evidence (superseded)

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

At that historical stage, passing configured jobs did not substitute for the then-unresolved
DAST/CodeQL evidence questions or open review findings. The later exact-head evidence above
supersedes that intermediate state.

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
`npm audit --audit-level=high` with zero vulnerabilities. Playwright discovery lists 144 tests
across the Chromium desktop and WebKit mobile projects, including 84 Production-application cases.
The current local environment has no usable Playwright browser binaries, so it cannot execute those
cross-browser cases; the attempted local execution failed only because the managed Chromium binary
is absent and is not recorded as product evidence.

This historical snapshot established the browser and exact-head gates required before closure. The
later immutable frontend executable and documentation-candidate evidence above supersedes its local
counts and former API pin. H-019 additionally requires final backend integration; earlier green
jobs, local discovery or local non-browser tests do not substitute for final exact-head GitHub and
hosted evidence.

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

## Remaining delivery gates before #170

1. Execute both H-040 provider races and tenant-wide lock-order cases on PostgreSQL 18.
   Implement H-034 through the ADR-012 managed-media contract and UI; add safe-delivery
   negatives and real-media acceptance. Implement H-035 through ADR-012 structured public
   values, withholding unmigrated Guest prose; known-label screening alone cannot certify
   unlabeled secrets absent.
2. Settle and record the final frontend and API SHAs. Use the ordered compatibility-first handoff to
   configure exact workflow inputs and deployment refs without inventing reciprocal commit hashes.
3. Run protected remote frontend gates, including quality, CodeQL, dependency/secret checks, real
   Chromium desktop and WebKit mobile, and the paired Shared Demo. Run the exact API gates including
   PostgreSQL 18 migration/up/down/rollback, dependency/secret checks and both Shared-Demo browsers.
4. Close the residual REG role-gate evidence for direct entry/reload, capability removal, complete
   Manager-surface absence and same-Tenant non-owner access. Record named human #182 acceptance for
   keyboard/focus, 200% reflow, responsive states, dialogs, print and real Room media.
5. After protected reviews and merges, obtain explicit operator authorization before applying API
   migrations or publishing Pages/Render. Then verify deployed identities and execute Hosted
   Acceptance, live journeys and exact three-surface DAST. Repository implementation cannot
   self-approve those results.
6. Reconcile #169 current-state documentation to the actual merged/deployed refs. Only then may the
   readiness marker become `ready`, #170 close and the SaaS 3.6 milestone be declared complete.

# SaaS 3.7 scenario progression acceptance

## Scope and defect corrections

Frontend issue #215 is closed; its accepted release evidence remains historical.
The same complete journey is a permanent regression gate for subsequent changes.
Passing the earlier shared journey only proved initial task/onboarding state,
not the complete scenario progression.
The dedicated `npm run test:e2e:saas37` suite exercises actual PostgreSQL state,
normal authorized HTTP routes and visible UI. It does not mock provider or
application routes, seed browser storage, bypass lifecycle, or edit database rows.

Two cycles each create and confirm a rich Northwind booking, inspect its details
and Manager plan with keyboard focus, complete Contoso's seven real pending
items, progress Fabrikam consent/discovery/import/free-busy verification, exercise
cross-Tenant/media/CSRF/role/lifecycle negatives, and reset all three scenarios.
Post-reset checks require original content, task counts, empty Fabrikam imports,
revoked independent sessions, removed new requests/media and original media bytes.
Evidence is scoped to the actual browser, runtime and reset checksum tested.

## Corrected contracts and ownership

The Customer Demo bootstrap injects the Demo-only Microsoft 365 connection
adapter. Its consent URL is restricted to the exact same HTTPS origin, fixed
callback path and exact bounded state/Tenant/consent query. The Production
factory remains fixed to Microsoft; no Demo adapter is reachable from Production
entrypoints. Only shared lifecycle/envelope parsing is factored into one common
module. The trusted backend still validates session, CSRF, one-time state,
provider-Tenant binding and operator authority. No client check grants authority.

The Manager worklist is a read projection, not a task engine. Its controller
rereads normal server adapters after successful request, room, catalogue or bulk
mutations. Generation/attachment/lock checks prevent stale UI resurrection;
failed rereads show unavailable state, not false task completion or a failed
committed write. Authority failures still invalidate the application. Existing
DE/EN translations and Manager surface patterns are reused.

The API correction makes Northwind healthy for its approved complete-booking
scenario and provides Fabrikam-only external discovery candidates without
pre-importing local rooms. Provider-unavailable unit tests remain, and the full
browser suite verifies disconnected integration fails closed. These changes
are documented in the API repository's corresponding correction record.

## Baseline and validation boundaries

Corrected seed contract: `saas-3.7-three-demo-customers-v1`.
Corrected semantic checksum:
`7e22005f1e9689fbea4ccfc75084f5f3d224fe10e60a6af23c1cb600f2b70014`.

An immutable corrected runtime/Frontend tuple, successful API quality/audit/DB
gates, frontend quality/audit/Chromium/WebKit gates, hosted scenario tests and
normal reviewed PR integration are required before closure. Historical hosted
runs explicitly retain their historical provider-health expectation; they do not
attest the corrected candidate. Run the new suite with corrected API code only.

The isolated configuration uses the repository's fixed local TLS edge. Hosted
scenario runs use only the two exact approved Render origins directly, so the
same-origin consent callback is not rewritten by a test proxy. Hosted TLS is
verified. Cleanup restores the canonical seed after a failed attempt and before
success evidence is attached; failure to prove reset is a failed test.

This is simulated Demo evidence, not live Microsoft, Production, formal WCAG or
penetration-test approval. No temporary source-transfer workflow belongs in the
final integrated tree.

## Room-description correction found by the full journey

The first corrected-cursor CI run reached the visible room-preview step and
exposed a missing description projection. The API now projects the existing
bounded public Room description from the same tenant-scoped catalogue read.
The browser accepts that exact optional presentation field, retains legacy
shapes, and renders it using the existing safe text-content DOM helper.
No tenant/settings authorization, provider fields, persistence or pricing
contract changes. Empty or malformed descriptions do not become authority.
Regression coverage includes bounds, unknown fields, legacy envelopes and
literal markup rendering without element creation; the real scenario requires
all ten seeded descriptions in their visible preview dialogs.

## Historical live release binding before the current corrections

The existing Render services deployed API merge `9c0f75c3d414968c18df9117214f3dc62be52c13`
with frontend `c1fee5e2c4f1d472174d194697dd635a5a9b0aef`. Subsequent frontend
changes correct test sequencing and expectations; application code remains the
same as that immutable deployed frontend. The API change corrects the bounded
public guest Room projection without changing the canonical seed. The isolated
API pin, hosted identity checks and DAST now target the deployed API. Full
hosted scenarios use real HTTPS origins directly, without a local edge or
disabled certificate checks.

Both browser suites run before independent canonical cleanup. The hosted job
reserves 2700 seconds for their bounded execution, server rate windows, failure
cleanup and post-journey identity verification. Scenario tests respect the real
60-second rate window before each browser and between complete cycles. They do
not raise limits, retry denials or reset limiter state.

Original SaaS 3.7 and historical SaaS 3.6 reset bindings remain explicit. Each
runtime must match its own source-validated seed/checksum; negative tests reject
substitution, including the original and corrected 3.7 checksum under the same
seed label. Active tenants must get 404 for foreign requests; unfinished
Fabrikam is denied earlier by lifecycle with 403. Foreign media must return
404 for all three tenants. This matches the existing authorization boundaries.

This historical checkpoint preceded #215 closure. Subsequent changes still need
successful current-head isolated and live evidence; configured gates alone are
not acceptance and do not reopen accepted historical milestone decisions.

## Browser response lifetime

The real UI action must return its exact expected HTTP status and JSON content
type. Its Chromium network body can be retired during document/context changes;
scenario tests do not treat that transient resource as committed-state evidence.
New bookings are located in the visible UI by their unique scenario title, then
read through the normal authenticated request endpoint and checked against the
complete expected detail/allocation contract. An unavailable-provider UI check
requires 503 and disabled progression; an independent non-mutating availability
read with the exact UI query additionally verifies the error contract. No mutation
is replayed, assertion skipped or denial retried to obtain a successful outcome.

The initial live full run `36678365509` completed both customer mutations and
reached cycle-two baseline restoration, but exceeded the local seven-minute test
budget. Hosted-only budgets now allow eleven minutes per browser and twenty-five
minutes globally; the isolated seven-/fifteen-minute limits remain unchanged. The
hosted reserve includes the existing eight-minute suite, twenty-five-minute full
suite, bounded independent resets and metadata margin. Action, navigation,
assertion, TLS, retry, rate-limit and security controls are unchanged. The failed
run's independent canonical cleanup succeeded; timeout is not acceptance.


## Permanent post-3.7 regression contract

SaaS 3.7 closure does not retire these fixtures or tests. Northwind, Contoso and Fabrikam are permanent Demo baselines for subsequent milestones. Relevant development must continue to provision their canonical data and pass the full Chromium/WebKit three-customer progression plus two-cycle reset gate before it is complete.

The gate verifies usable post-reset scenarios rather than fixture presence: Northwind rich booking/room/catalogue/media data, Contoso state-derived Conference Manager work, Fabrikam state-derived Tenant Admin onboarding, tenant/role/CSRF isolation, media integrity and canonical reset reproducibility. Cross-repository validation uses immutable counterpart commits. Any intentional semantic change to these scenarios requires coordinated seed-version/checksum, documentation and acceptance updates; silently dropping data, customers, tasks, reset assertions or browser coverage is prohibited.

## Historical aggregate budget correction before the Guest/media corrections (2026-10-02)

The budget and deployment paragraphs above are historical evidence. The deployed
identity at this earlier checkpoint was frontend
`c614f2bdb36c48199daacc2cc7bb0d0154b80f64` paired with API
`62ad13bce72d3d99e02a39b5f96f1078fecc7e2f`.

Hosted run `37042415907`, second attempt, passed both cross-role browsers but
terminated Chromium at its eleven-minute aggregate cap during cycle-two
restoration. It did not reproduce the first attempt's Contoso status assertion
failure; that earlier failure is not explained or accepted by this correction.
Independent cleanup and final deployment identity succeeded. Neither attempt
is passing full-scenario evidence.

Each full scenario now includes four mandatory 61-second rate windows (244
seconds), including restoration phases. Hosted scenarios have a bounded
thirteen-minute per-browser budget and twenty-nine-minute serial suite budget.
Isolated scenarios retain ten minutes per browser, with the global cap corrected
from fifteen to twenty-two minutes so both browsers and teardown can complete.
The scenario inherits its config instead of overriding the timeout separately.
Regression tests require the global cap to cover every configured browser plus
at least two minutes for setup/teardown.

The sixty-minute hosted job reserves fifty minutes before destructive work:
twelve minutes for cross-role tests, twenty-nine for full scenarios, and nine
for independent cleanup/identity/evidence. The start guard fails closed if that
reserve is unavailable. Action (15s), navigation (30s), assertion (10s), zero
retries, TLS, all customer/negative/media/reset checks, rate limits and canonical
seed/checksum are unchanged. This supersedes the isolated WebKit-only proposal
in PR #227; successful current-head gates remain required before integration.

## Current Guest/media/worklist acceptance correction (2026-10-02)

The expanded Chromium API journey passed both complete cycles in run
`37075649131` (8.0 minutes). WebKit reached the second Northwind booking at the
former 600-second aggregate cap; it reported no failed business/security
assertion before that deadline, but its incomplete run is not acceptance.
Six mandatory rate windows consume 366 seconds per browser. The follow-up WebKit run `37077163740` completed both customer mutations,
provider negatives and canonical resets, then exhausted 900s immediately before
the second restoration check. Its first restoration took 14s; about 20s plus
runner/cleanup margin remain necessary. An incomplete run is still not acceptance.
The bounded
isolated budget is now 1020 seconds per browser and 2160 seconds serially;
hosted uses 1080 and 2280 seconds. The current hosted job permits 80 minutes and reserves
70 minutes before destructive work, including the cross-role suite, 38-minute
full-scenario cap and independent cleanup/identity margin. The isolated CI job
permits 50 minutes for setup, both suites, actual zoom and teardown. Action,
navigation, assertion, retry, TLS, rate and security limits remain unchanged.
The actual headed Chromium worklist zoom check runs before the full scenarios;
the following scenario starts in its existing fresh rate window and resets the
canonical baseline independently.

PR #225 is integrated and #227 closed as superseded. PR #257 preserves every
customer, authority, baseline-count and two-reset assertion, while adding actual
Guest stylesheet/print layout checks and Catering create/replace/delete/recreate
coverage. Post-mutation Northwind has nine Catering items; the initial and restored
canonical baseline still has eight. The booking UI is checked against the actual
independently loaded current catalogue rather than an obsolete pre-mutation count.

Six mandatory 61-second rate windows now consume 366 seconds per browser. The
provider-negative phase starts in its own real source-IP quota window, before any
availability request, so the required 503 is not masked by the unrelated HTTP
quota. No server limit is raised and no denial is retried. Earlier isolated 600-second/1320-second and hosted 780-second/1740-second
caps are historical; current test/suite caps are the 1020/2160 and 1080/2280
second bounds above.
Mutation HTTP status and visible results are verified; persisted media bytes are
read independently through normal authenticated GETs instead of relying on CDP
response bodies that Chromium may retire during a long progression. Exact normalized
WebP replacement hash across different owners, decoded newly created media and retained unsaved drafts remain
required. No mutation is replayed to produce evidence.

The existing full Chromium/WebKit suites remain mandatory. An additional headed
Chromium step sets and reads the real tab zoom to 2, checks worklist reflow and
44px actions, keyboard disclosure/navigation, and performs authorized reset cleanup.
Equivalent 640px viewport tests alone are not described as actual browser zoom.
API #104 historically promoted the matching immutable frontend and acceptance contract through
the existing private Gitlink. Source/Live identity, paired CI and Hosted/DAST proof
must be reconciled before closing the correction or final milestone gates. #256/#226/#228 are now
completed; that historical pair does not certify a successor.


## Historical Guest/media/worklist correction runtime binding — 3 October 2026

API PR #104 merged as `7adb670a03f1372c70dd1405c0e4b269daa0d9df` and the existing
private Gitlink delivery promotes frontend `c4eda7750933c2b3c5b561fae0926d36cdc53582`.
Both public Render origins expose this immutable pair in their deployment metadata.
API CI `37079291199` passed the full Chromium and WebKit three-customer journey and
both canonical reset cycles. The seed version and semantic checksum are unchanged.

Frontend PR #257 successors change only tests, workflow identity, reset evidence and
documentation; their application source/assets are byteidentical to that deployed
snapshot. Hosted/DAST expected identities and isolated trusted API checkout bind to
the actual merge above, never a predicted merge SHA. Final current-head Hosted
acceptance additionally proves the live full journey, stable identity and independent
canonical cleanup; source-only API evidence is not substituted for that live gate.
Explicit historical cleanup bindings for `62ad13b` and `96294cc` retain their exact
canonical seed/checksum, while unknown runtimes remain rejected.


## Current final baseline and readiness promotion — 4 October 2026

The executed protected-main, private-source and Hosted baseline is recorded in
`docs/SAAS-3.6-RELEASE-EVIDENCE.md`. All three customers, Contoso's seven actual
state-derived tasks, every role/CSRF/Tenant negative, both browser engines and
both full reset cycles remain mandatory. Ready markers are scoped accepted Demo
UX; final paired publication and exact live refs belong to #170. The unchanged
schema/overlay is 42/7 and the seed/checksum above remains canonical. Final
promotion updates the trusted immutable API checkout, Hosted/DAST identity and
reset binding together; historical supported predecessor bindings are retained.

## SaaS 3.8 private media revalidation contract — 7 October 2026

The isolated frontend CI candidate binds to API
`87719aaea146ade797273039e03e8406dbcc3e19`. Room and Catalogue image GETs now
require `private, no-cache, max-age=0, must-revalidate`, `Vary: Cookie` and an
opaque strong ETag. The full scenarios independently read and hash the media,
then require a bodyless 304 for an authorized unchanged representation.
The shared journey additionally requires 401 without authentication and after
reset invalidates the session, 404 for a foreign Tenant with the same ETag, and
404 for reset-removed media even with its former ETag. Every existing customer,
role, CSRF, lifecycle, byte-integrity and two-cycle reset assertion remains.

This intentional transport change leaves the canonical seed version and semantic
checksum above unchanged. JSON API/session/mutation responses retain no-store;
304 requires current server authorization and verified media, not cached authority.
The new contract reduces response transfer; it does not claim avoided database or
object-provider reads. No browser cache becomes a business/session source of truth.

The existing Hosted identity/reset bindings remain historical deployed evidence.
The changed full scenarios require a coordinated compatible API promotion before
manual Hosted execution; this source candidate is not live acceptance or release
closure. Immutable paired CI results must be recorded before integration.


## SaaS 3.8 hosted runtime promotion — 8 October 2026

Protected initialization run `37792057793` completed migration and deterministic reset
on API `c9f1e45565c268768c1b814b610bf5cab6b8650a`. Independent database
readback confirmed canonical schema 44 and Demo overlay 9. Customer deployment
`dep-db3qhil9fdbs73erk2n0` and Platform deployment `dep-db3qhc2j9qps738met1g`
are live at that API with frontend `5d5102b4f9842ec704ff26441ebe96719324ddb0`.
Both public build-bound identity artifacts and readiness endpoints returned HTTP 200.

Hosted acceptance, DAST identity, canonical cleanup and isolated paired CI now
target that exact API. Previous cleanup bindings remain explicit. The seed version
and semantic checksum are unchanged. This is deployment/readiness evidence only;
fresh full hosted Chromium/WebKit progression, two-cycle resets and DAST remain
required before release acceptance. No provider-storage cutover or measured cost
savings is claimed.

ZAP run `37794011737` passed raw passive scanning and both live identity checks,
but its exact policy rejected the new fingerprinted asset URLs. Artifacts
`11557023939` (Customer) and `11557722499` (Platform) contain 30 and 29 raw
instances respectively, all risk 0. The public function-identifier evidence is
unchanged. Exact observed hashes now retain the crawler request-header review;
`10049-3` additionally permits only the observed immutable public assets at risk 0
with exact `max-age=31536000`, empty parameter/attack and a SHA-256 query.
Unknown URLs/hashes, dynamic API URLs, altered evidence, methods or elevated
risk remain blocking. Local replay of both complete raw reports passed under
the revised policy; a fresh GitHub scan remains required.

## Persona-switch synchronization candidate — 9 October 2026

API PR #132 candidate `a0bb54986c15388cebfc7958cd5d2eddb132e113`
passed three browser/storage rows, quality and PostgreSQL integration. The
WebKit/PostgreSQL row failed twice at the first Northwind persona switch:
the post-reload session response waiter expired before the UI operation finished.
These failed attempts remain failures; their artifacts do not prove the underlying
pointer-actionability cause or a successful three-customer acceptance.

The scenario helper now verifies pointer actionability with a trial click before
starting the unchanged response deadlines, and awaits the actual click, both exact
HTTP responses and document reload in one Promise.all. This prevents an unawaited
response rejection from masking an unfinished click. No forced click, dispatched
event, replay, retry, timeout increase or removed assertion is introduced. The
same selected values, successful server switch/fresh bootstrap, independent
session read, all customer/security/media checks and two resets remain mandatory.
Isolated frontend CI binds to that unmerged API candidate; live identity bindings
remain unchanged until reviewed integration and coordinated deployment.

Run `37796174030`, artifacts `11559095477` (Customer) and `11558368845`
(Platform), exposed additional static-asset samples under the same reviewed
informational rules; both raw reports again contain 30/29 risk-0 instances.
The root pages directly reference ten Customer and seven Platform fingerprinted
assets. All seventeen were independently fetched on 8 October: HTTP 200, the
SHA-256 of each complete response body equals its exact URL query, and
`Cache-Control` is `public, max-age=31536000, immutable`. Their exact URLs now
cover the informational missing crawler Fetch Metadata headers and immutable
cache observations without depending on which five instances ZAP samples.
Both generations of complete reports replay successfully. Unknown hashes and
risk elevations remain blocking; a fresh exact-head GitHub scan is still required.

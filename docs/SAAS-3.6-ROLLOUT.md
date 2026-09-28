# SaaS 3.6 Request contract rollout

> Historical rollout plan from 27 September 2026. The draft PRs, schema 38,
> candidate hashes, pending migrations and deployment instructions below have
> been superseded by the integrated status in
> `SAAS-3.6-HARDENING-REGISTER.md` (schema 40 and deployed API/frontend pair).
> Do not use this plan as the current release checklist; #170 and #182 track
> the remaining validation and named acceptance gates.

## Current candidate state

The last fully browser-executed frontend draft PR #201 head
`5b47eb6bd544dac6fbfdebc14768f4fa005f4f96` contains the Equipment,
persisted-attribution and Guest Information consumers, response binding, visible-version `If-Match`
transition requests, central authority/branding invalidation, known-label Guest correction and a
test-only REG direct-entry/reload/role-loss and dual-role/Manager-absence successor.
Its successor includes the nested Manager form CSS correction and this evidence update;
the final frontend SHA must be taken from PR #201 after CI completes.
API draft PR #78 head `8c40290ae984433b8a69a7ef13ce842dea64c50e` contains schema 38, migrations
035-038, Equipment/attribution/Guest contracts, server-side transition precondition, fail-closed
reconciliation and both H-040 provider-event fences with canonical Request mutation lock order.
H-035 now has the accepted structured-content product direction in ADR-012; its implementation
and risk/evidence gates remain open.

These are synchronized draft PR candidates, not merged or deployed release refs. Frontend
CI selects API `8c40290a`; API PR #78's Render manifest still pins older frontend `7b17a2c`.
API exact-pair CI `36265393728` passed quality, PostgreSQL 18 migration/persistence/race
tests and both shared-Demo browser engines on that run's pinned frontend; frontend
CI `36269943540` passed quality/shared Demo and 260/262 Chromium/WebKit cases.
The two failures are one mirrored Manager 320px form-reflow issue; a focused CSS
correction is pending exact-head CI.
Neither PR has a protected review or human release acceptance. Render Customer and
Platform Demo now run API `eb451bcb8aac59c2c68e0d0b96ff2076f85f5cfb` via manual live deploys
`dep-dasfq1d9fdbs73d8h1mg` and `dep-dasfpqvpn0mc7387m4og` from 27 September 2026.
No deployed identity for the candidate pair has been recorded.

Frontend `5b47eb6b` passed local `npm run check` with 458/458 tests. Its GitHub CI
executed 262 Chromium desktop/WebKit mobile cases: 260 passed, two failed from the
same nested Manager form overflow. A further CSS correction needs the full browser matrix.
API `8c40290a` passed local `npm run check` (788/788), audit with zero
vulnerabilities and PostgreSQL 18 two-client race/migration checks in CI
`36265393728`. None of these results proves H-034/H-035 or deployment acceptance.

EMP-03 is incomplete: the API exposes opaque Room asset identifiers, while the frontend renders
synthetic schematics and deliberately performs no asset request. H-034 in the hardening register must
be resolved with a bounded authenticated delivery contract and real image UI/tests, or with an
explicit approved change to the parity requirement, before #182 or #170 can pass.
The current Room JSON has neither a Tenant-owned asset registry nor bytes or an upload/delivery route.
A production implementation needs an approved storage and quota/backup/retention choice (for example,
bounded PostgreSQL raster bytes versus a private object store with an API proxy), allowed image
formats and processing, Room-reference lifecycle, and floorplan read/upload authority. IDs alone
must never become arbitrary fetch URLs.
`ADR-012-SAAS36-ROOM-MEDIA-AND-GUEST-PUBLIC-CONTENT.md` records the accepted managed-media
product direction, including byte/quota limits, roles, lifecycle and the evidence required
before implementation can count toward EMP-03.

H-035 cannot be closed by a credential-label scanner alone: unrestricted public Guest copy can
describe a code without any label. Symmetric screening and multilingual regression tests reduce
known bypasses, but product/security must choose credential-incapable structured hints or accountable
editorial approval with explicit residual-risk acceptance; alternatively withhold public Guest copy
until an approved contract exists. Passing unit tests do not prove free text contains no secret.
ADR-012 also selects structured public values and explicitly withholds unmigrated legacy
Guest prose. The Product Owner accepted the residual risk of older public Site/Room
display names, address, route and business contact on 2026-09-28 under the owning-role
withhold/correct policy in ADR-012. This does not sign off the Security Owner release
disposition or prove the H-035 candidate deployed; #182/#170 remain open.

## Compatibility contract

The Request wire reader accepts the exact existing response envelope v2 and the exact attribution
envelope v3. All affected attribution-bearing public outer envelopes use `schemaVersion: 3`; their
nested Request composition remains independently versioned as `request.schemaVersion: 1|2|3`.
Envelope v3 requires persisted requester/action attribution, and adding those fields to envelope v2
is rejected. Composition v2 stays frozen; composition v3 requires Equipment selection and matching
immutable price lines and totals.

Existing v2 Requests and pending v2 booking-change proposals remain readable during the transition.
Normal Room context remains v1. Guest Presentation requires the explicit `projection=guest` request
and its own v2 envelope. Compatibility does not authorize a principal-derived attribution fallback,
an arbitrary asset URL, a schema downgrade, or a broader role/permission projection.

Transition commands additionally carry the displayed Request version as one strong decimal
`If-Match` tag (for example `"3"`). The frontend sends it first: an older API ignores this
additive header while the compatibility-capable client remains operational. Only after that client
is deployed may the new API require the precondition and atomically reject stale state/version with
409 before any provider or calendar side effect. A malformed, missing, wildcard, weak or multi-tag
precondition fails closed. Response validation alone is not concurrency control; H-038 must be
closed on the server before release. The server returns 409 on a predecessor-version retry even
if status and reason match: without a persisted operation identity that response could belong to a
different actor. Only an authorized command against the exact current terminal version can read
the already-target outcome; a Confirmed retry never falls back to Employee read permission.
H-040 is a separate final-confirmation race: a losing concurrent confirmation could compensate
a deterministic provider event that the winner was about to persist. API `8c40290a` fences both
that compensation path and the write-disabled pre-confirmation cleanup with durable Request
version/status and provider-reference state, and canonicalizes the Revision-Watermark→Tenant-Audit
lock order across Request mutations. The committed two-client tests ran on PostgreSQL 18 in
API CI `36265393728`; repeat on the final reviewed head after H-034/H-035 migrations.

## Ordered release handoff

1. Preserve the passing H-040 PostgreSQL 18 evidence and implement H-034/H-035 under
   ADR-012; repeat migration, provider-event race and lock-order tests on the final API
   schema, then settle the exact final frontend
   and API SHAs. Preserve the already-integrated compatibility reader while concurrent security
   and acceptance fixes land.
2. Run protected exact-head repository gates for both candidates. Record an ordered release pair
   through explicit workflow inputs/post-merge refs; reciprocal commit-SHA pins are not a valid or
   achievable substitute because they would create a hash cycle.
3. Deploy the verified compatibility-capable frontend before changing the public API envelope. Drain
   old API writers, then apply migrations 035-038 through the protected PostgreSQL 18 workflow and
   verify schema 38, attribution snapshots and rollback/forward-fix guards.
4. Deploy the verified API candidate and confirm the exact runtime identity. Only after the compatible
   API is healthy may the frontend build containing the already-active Equipment, attribution and
   Guest Information consumers be published.
5. Pin Customer and Platform Demo workflow inputs to the reviewed pair and execute both Shared-Demo
   browser projects, Hosted Acceptance and the exact three-surface DAST policy.
6. Complete the #182 parity gate and named human acceptance, then the #170 release gate. Publication
   and migration require explicit operator authorization even when a workflow token is technically
   able to write.

Until every gate is green on the integrated and deployed final heads, the public HTML readiness markers remain
`in-validation`; local fixes, Node tests or Playwright discovery must not advance them to `ready`.

## Required evidence

| Surface | Required final evidence |
| --- | --- |
| Frontend | Exact final SHA; remote quality, architecture, CodeQL, dependency and secret gates; real Chromium desktop and WebKit mobile; complete REG/Employee/Manager traceability |
| API | Exact final SHA; schema 38; PostgreSQL 18 migration/up/down/rollback suite; unit/API, dependency and secret gates |
| Pair | Explicit workflow-dispatch or post-merge refs; Shared Demo in both browsers; verified Customer and Platform deployment identities |
| EMP-03 | Authenticated same-Tenant asset delivery with content-type/size/cache/error bounds, SSRF/arbitrary-URL negatives and real floorplan/media rendering |
| Human acceptance | Keyboard/focus, dialogs, 200% reflow, responsive states, localization, print and real Room media reviewed against #182 |
| Public release | Protected merges, explicit publication/migration approval, Hosted Acceptance, live journeys and exact three-surface DAST |

Current traceability identifies partial REG-01 authorized Tenant Admin, REG-02 Manager-absence and
REG-03 dual-role browser journeys; the PR browser jobs executed Tenant Admin
direct-entry/reload, Demo role-loss, Production reload role-loss and dual-role/Manager-absence
tests. It does not yet close all deep-entry/reload cases, live Production stale-capability removal,
the complete Manager report/Room-price absence matrix or same-Tenant non-owner Request access.
API authorization negatives complement, but do not replace, those browser outcomes.

## Downgrade and recovery

Once schema 38 migrations are applied, v3 Requests or persisted attribution evidence exists, a schema
downgrade must refuse rather than discard or reinterpret historical data. Exercise migrations
035-038 and their supported rollback boundaries in PostgreSQL 18 before Production. If a deployed
consumer or provider fails after the data boundary advances, retain a compatible binary and use a
forward fix; do not revive an old writer or synthesize attribution from the current principal.

Record exact final SHAs, workflow inputs, migration result, PostgreSQL evidence, browser artifacts,
deployed identities, Hosted Acceptance, DAST and named human sign-off in the owning issues. Historical
CI for earlier SHAs remains audit history only and cannot be promoted as evidence for the final pair.

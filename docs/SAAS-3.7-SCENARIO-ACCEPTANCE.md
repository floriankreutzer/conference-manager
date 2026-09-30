# SaaS 3.7 scenario progression acceptance

## Scope and defect corrections

Frontend issue #215 remains the release gate. Passing the earlier shared journey
only proved initial task/onboarding state, not the complete scenario progression.
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

## Corrected live release binding

The existing Render services deployed API merge `8e4dedd1a676a2dab26bc4ec812876eac98fc282`
with frontend `c1fee5e2c4f1d472174d194697dd635a5a9b0aef`. Subsequent frontend
changes correct test sequencing and expectations; application code remains the
same as that immutable deployed frontend. The isolated API pin, hosted identity
checks and DAST now target the deployed API. Full hosted scenarios use real
HTTPS origins directly, without a local edge or disabled certificate checks.

Both browser suites run before independent canonical cleanup. The hosted job
reserves 2400 seconds for their bounded execution, server rate windows, failure
cleanup and post-journey identity verification. Scenario tests respect the real
60-second rate window before each browser and between complete cycles. They do
not raise limits, retry denials or reset limiter state.

Original SaaS 3.7 and historical SaaS 3.6 reset bindings remain explicit. Each
runtime must match its own source-validated seed/checksum; negative tests reject
substitution, including the original and corrected 3.7 checksum under the same
seed label. Active tenants must get 404 for foreign requests; unfinished
Fabrikam is denied earlier by lifecycle with 403. Foreign media must return
404 for all three tenants. This matches the existing authorization boundaries.

Successful current-head isolated and live evidence is still required before
closing #215 or the milestone; these configured gates alone are not acceptance.

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

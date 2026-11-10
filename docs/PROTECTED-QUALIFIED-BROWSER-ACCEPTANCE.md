# Qualified protected browser acceptance

## Candidate pairing — 10 November 2026 (CO-320 / CO-322)

The current qualification selects API candidate A
`529c1fff7982ec334136c3b23ace2a7169dc6cbc` from
[API PR411](https://github.com/floriankreutzer/conference-manager-api/pull/411).
It contains the protected static response COEP correction. Both API checkouts
and `PROTECTED_BROWSER_COUNTERPART_REF` identify that same immutable source;
the existing matrix regression retains its exact pin and fail-closed assertions.
The frontend also includes the independently reproduced duration correction in
the [CO-322 follow-up](CO-322-ROOM-AVAILABILITY-FOLLOW-UP.md). The original Safari
cause remains unresolved: its visually inspected screenshot shows the room-step
failure, not the scheduling inputs or a correlated response.

For this A/F qualification, F is the frontend checkout actually verified against
`GITHUB_SHA`. A pull-request run can use a synthetic merge commit, so retain its
source PR head, actual checkout SHA and tree separately. Candidate checks do not
replace the independent merged-Main qualification. Full regular and protected
Chromium/WebKit matrices and the permanent shared three-customer/two-reset gates
remain required; selecting these sources does not claim that any has passed.

The later sealed release R/F is a separate stage. R must select the qualified
merged F and establish the complete, explicitly scoped A-to-R runtime comparison,
its own required CI, two real R/F wrapper builds and independent artifact
readback. Runtime drift requires fresh qualification. The existing
[daily release runbook](https://github.com/floriankreutzer/conference-manager-api/blob/529c1fff7982ec334136c3b23ace2a7169dc6cbc/docs/QA-20261104-DAILY-RELEASE.md)
and [SaaS1 follow-up runbook](https://github.com/floriankreutzer/conference-manager-api/blob/529c1fff7982ec334136c3b23ace2a7169dc6cbc/docs/QA-20261109-SAAS1-FOLLOWUP-RELEASE.md)
govern that sequence. F does not need to pin a future R recursively. This
qualification selection claims no deployment, live DAST or real provider result.

## Historical pairing evidence

The earlier separate acceptance matrix ran the exact frontend candidate against pinned
API 0ef08b5eaec473a1458b8d22ecc5a798c20a81da, the private daily reader
with current Jira governance and protected deployment identity (CO-84 / API PR376).
Frontend PR446 (CO-81) passed the complete candidate matrix in CI41865825475;
API PR376 passed CI41865832585. Their earlier cancelled runs remain historical.
The selected API863e8220 differs only in its protected frontend Gitlink and build
document; application, tests, dependency locks and wrapper are byte-identical.
Independent Main and actual provider acceptance remain separate release gates.
The immutable pair requires fresh complete CI; this document is not a hosted
release receipt. The insight wire gate exercises the actual API route,
authorization, minimized daily adapter, epoch-bound runtime snapshot and production
frontend client together. It preserves independent observation/evaluation clocks,
last-good state, unknown Product outcomes and the synthetic INT label.

Historical counterpart: fcd577aaadf83abfbc0d849ba363883f120463ca was the prior
protected Product collector candidate in API PR360, stacked on the schema75 and
service-identity change. Its evidence remains bound to that earlier pair.

## Qualification contract

Both refs are checked before setup and copied into unchanged closed runtime
configuration and bounded evidence. It adds to the full regular Chromium/WebKit
suites and unchanged permanent three-customer/two-reset/shared/zoom gates.
The required e2e status requires both complete browser matrices;
failures/cancellation/skips cannot pass the aggregate. Its negative truth table
covers both matrix results.

Historical Recovery counterpart update — 30 October 2026: both API checkouts, the protected environment
pin and fixed test expectations identify the same combined Customer Microsoft
routing, Recovery target proof/transaction and neutral confirmation-return source. The
owner browser journey now requires an explicit target read, cancellation, a fresh
Microsoft-confirmed HTTP200, native confirmation-tab close, return focus and unchanged
customer/section. A separately labeled close-refusal simulation checks the
accessible bilingual fallback. All original owner-role and invited-participant
journeys, proof capacity, negative boundaries and time limits remain required.
No existing case is removed. The earlier 5ed5 candidate pair passed both complete
protected engines, including the confirmed target read and native return. This
Main counterpart pin must receive fresh complete paired checks before release;
source or fixture results alone do not prove real Microsoft or hosted acceptance.

Regular canaries are bound to the selected matrix engine, just like the full
suite. The Guest print, Tenant Admin and Employee canaries previously ran both
engines in each row, duplicating the same engine/case pairs. Both complete
projects, all distinct canary cases, the two-engine transport check, fail-closed
aggregate remain. The regular browser rows have a bounded 50-minute budget
for installation, canaries, the complete suite and evidence upload; individual test
deadlines and the full engine matrix are unchanged. CI42700749637 on frontend
23c8875 reached the previous 40-minute job limit with 522 of 581 WebKit full-suite
cases passed and 59 still unproved; no test failure appeared before cancellation.
The cancelled job and its stale one-case canary report are not full-suite acceptance.
Fresh complete candidate and separate Main checks remain required.

Historical 30-minute budget: the earlier c4b0 attempt's WebKit log reports 406
passed immediately before cancellation at that budget; its failed workflow result
remains historical evidence and is not accepted as a pass.

The test-only API288 bootstrap provisions actual verified PostgreSQL TLS/SCRAM,
fresh restricted roles and separate max1 Customer/Platform business+lease pools.
No authentication/provider/clock/database-driver/test port is injected into a
production root. Only initial normal Platform MFA and two generated software
P256 keys are canonical fixture state. Real Microsoft primary, physical distinct
keys, enrollment/recovery, mail/sender and operating cutover remain unproved.

Actual document origins are default-port HTTPS app-int.example.test and
ops-int.example.com, different registrable sites. A fixed two-authority CONNECT
relay forwards untouched TLS bytes only to the loopback edge. It cannot contact
another host or add authentication headers. The edge requires exact Host/SNI,
forwards every static/API request to the actual matching root. The normal build
module writes separate externally pinned manifests before those roots start;
the edge serves no file or HTML itself.
It never mocks protocol responses. Scripts/tests/manifests/foreign-plane modules
are not public files. Ordered artifact content hashes bind transformed HTML and
served files. Responses/headers/bodies/connections/observability have bounds.

A one-day ephemeral root/leaf certificate with both DNS SANs is installed through
normal NSS/system test CA trust, then removed with its private keys after the
run. ignoreHTTPSErrors remains false. No public DNS, trust bypass, external TLS
interception, provider compute, image pull or paid service is used. Only the
existing included CI runner and cached pinned PostgreSQL image are needed.

Chromium imports the two matching ephemeral ES256 keys into its native virtual
CTAP2 authenticator with UV/resident credentials and the actual Platform RP.
WebKit uses an explicitly labeled test-only software assertion bridge that checks
the actual frame origin, RP, challenge, allowlist and required UV before signing;
the real pinned server verifier accepts the result. This proves WebKit document,
TLS, cookies and native form behavior, not its native WebAuthn engine or hardware.
No private key enters browser JavaScript. Existing Customer Lax and Platform
Strict session cookies keep their real paths/flags; signed arrival is anonymous across sites and subsequent
same-origin session reads use the current cookie. No cookie is weakened.

The prepared journey creates the actual three-customer generation with a fresh
assertion, starts a native Customer form, approves Fabrikam Admin on the Platform
with a fresh exact assertion, confirms on the Customer, imports both server
candidates and completes onboarding→ready→active. It logs out through normal UI,
repeats the native handoff as Northwind Employee, and opens actual private Room
images through the ordinary editor. It checks exact current role/status, visible
image decoding, private cookie separation, no Demo request or stored proof,
cross-site arrivals/callbacks, same-origin completion and full Tenant HMAC chains.
Evidence contains only engines, declared authenticator scope, fixed origins,
source refs/artifact hashes, bounded counts and Tenant states. Trace, screenshot,
video and request/cookie/hidden form captures are disabled only in this separate
sensitive suite; normal existing evidence gates are retained unchanged.

## Invitation-bound participant acceptance

Two additional independent cases retain the existing240s deadline and zero
retries. Each creates its own complete canonical generation through the actual
Platform UI and explicit isolated Microsoft approvals. The booking/decision
case invites a Northwind Employee and a distinct Contoso Manager, activates
ready Contoso through the existing attributable operator Admin handoff before
Manager admission,
uses actual invitation-bound email/code admission, books as Employee and
decides the Manager's own request while rejecting a foreign Tenant target.
The onboarding case separately invites a Fabrikam Admin and performs actual
code admission, both local imports and ready/active progression. Both require
normal logout204, an unauthenticated session401 and the visible email form.
No generation, invitation or membership is seeded by the participant fixture.

The fixture reads only its fixed synthetic example.test mailboxes from the
current generation's encrypted outbox. Real recipient delivery and the Microsoft
provider remain separate operating acceptance. Actual PostgreSQL-clock waits
honor the existing Microsoft operation capacity; proofs, counters, clocks and
limits are not rewritten. Completed neutral provider tabs are closed and the
source application regains focus before waiting for its independent result.
The booking/decision case completes Northwind admission/booking/logout before
issuing Contoso's invitation. Its real Microsoft capacity interval overlaps the
shared client address's unchanged60s window; any remaining quiet interval is
waited before the Contoso Admin prerequisite and Manager admission. Northwind
uses the initial untouched Customer window; the Admin activation follows its
logout and the actual quiet interval. Distinct people still share this loopback
address and its120-request budget. All work and waits remain within the original
240s case, without retrying a failed request. Application enrollment/credential APIs are forbidden
in these participant cases. Current Tenant HMAC chains and zero application
keys remain required.

The existing edge compacts successful immutable assets at fixed boundaries:
after Northwind logout and after the Contoso Admin prerequisite, before Manager
admission; the independent onboarding case compacts after its invitation.
Only successful immutable-asset events become per-surface counts. It retains every API, authentication,
document, failed and unfinished event in order. The2000-event limit and the
two-compaction maximum remain unchanged; each case verifies the exact planned phase count
(two booking/decision, one onboarding) and the retained/completed counts. This
addresses the observed Chromium7c2ff5f failure with exactly2000 stored events,
logout204 and the next session400. That historical failure is retained; the
change still requires fresh complete acceptance on both engines, all regular
and permanent gates, review and separate Main qualification.

## CONNECT idle lifecycle

The qualified loopback relay retains its20s idle timeout. Expiry closes both
network peers, so an unused preconnection cannot remain open on the browser side
with no upstream. Its shared Node tunnel helper is exercised through actual
loopback TCP/CONNECT traffic and the real timeout: the preceding one-sided
close failed the30s downstream observation; symmetric closure passed after20s.
The regression is chunk-safe and retains no authentication or TLS payloads.
This is transport-lifecycle evidence, not a provider/device or complete browser
pass. Host admission, byte-transparent TLS, all limits, no retries and fresh
full-engine/permanent/Main qualification remain required.

## Historical execution checkpoints

Local pure artifact/ref/key/aggregate checks pass. Full local frontend and fresh
CI/native/qualified browser execution remain pending; Docker and pinned browsers
are absent locally. No actual browser, physical key or live cutover pass is
claimed by this preparation. SaaS1 issue351/milestone2.

Initial CI39610029988 on6e0e90ed is retained as failed. Chromium passed actual
qualified TLS, native CTAP2 generation/handoff and full Fabrikam import/activation,
then the new test incorrectly expected a Strict Customer cookie. Inspection of
the unchanged canonical cookie serializer confirmed Customer Lax/Path /api and
Platform Strict/Path /api/v1/platform; assertions now require those exact existing
policies, without changing server cookies. WebKit stopped after generation
confirmation; its software bridge now supplies the test facade when that engine
has no navigator.credentials. Bounded path/status/error-code diagnostics are
prepared if further failure remains. No qualified journey pass is claimed yet.

Corrected a20c0985/CI39611541040 passed qualified TLS, both actual generation/
handoff/Fabrikam import-ready-active paths and the cookie assertions in both
engines. The second Northwind Employee handoff also completed; both tests then
looked for an exact "Profil" accessible name although a nonempty real profile
uses the established "Angemeldeter Benutzer {name}" label. The test now selects
the existing profile navigation dialog trigger and asserts the exact respective
setup/loaded-profile accessible-name policy. No production label/auth behavior,
timeout, privacy rule or assertion case is weakened. Full journey remains pending.

The preceding qualified journey on frontend5b0e57d9/APIca7c29a2 passed both
engines in CI39613292536: native virtual CTAP2 Chromium1passed17.8s and explicitly
qualified software-assertion WebKit1passed23.3s, actual trusted different-site
HTTPS, both handoffs, Fabrikam active, private images and all3 Tenant audit
chains. Regular/permanent gates remained pending at that checkpoint. That
proved the earlier test-edge static arrangement. This successor pins API288
and requires fresh proof that the actual protected processes own delivery;
previous browser results cannot substitute for this new boundary.

Initial actual owned-delivery CI39617252870 failed both engines on HTTP429 from
the new static limiter after repeated legitimate cold graph navigations. API
successor1dc5b011 derives its bounded budget from the sealed file count, admits
sixteen cold graphs/minute/address and caps4096 requests/2000 keys. The API/auth
limits and edge2000-event bound remain unchanged. An additional real-HTTP
budget/429/API-isolation regression case is prepared. This successor pins that
exact correction; initial failures remain historical and fresh full/qualified
execution is mandatory. Local execution service is currently unresponsive;
previous884 local passes do not prove this counterpart update.

The actual-main predecessor's auxiliary gates exposed exact public-SHA
false positives and the release inventory's required single paired API ref.
Both this branch's shared/permanent and qualified paths now use exact1dc5b011;
all original contract/zoom/full progression/two-reset steps are retained. The
pinned independent release verifier is unchanged. The harness variable name
is PROTECTED_BROWSER_COUNTERPART_REF, and only the two observed predecessor
commit/path/rule/line fingerprints are carried in .gitleaksignore. Full history
scanning and every other secret finding remain enforced. Fresh full CI is
required; prior qualified success onbcd529d9 remains dated evidence only.

Inherited actual-main predecessor evidence (retained during the normal base merge):

Actual-mainfb6c6272 first auxiliary gates failed: full-history generic-api-key
classified two public immutable API commit pins as credentials, and the pinned
release tool correctly rejected two different paired API refs. This correction
uses the fully feature-accepted APIca7c29a2 for both shared/permanent and qualified
checkout paths; all existing contract/browser/zoom/reset steps remain required
against that exact counterpart. The inventory's single immutable counterpart
contract stays unchanged. A CI assertion requires both checkout refs to match.
The nonsecret harness variable is now PROTECTED_BROWSER_COUNTERPART_REF.
Only the two observed exact commit/path/rule/line fingerprints are recorded in
.gitleaksignore; no rule, path or secret-value wildcard is excluded and the full
history scan stays enabled. Prior failed auxiliary runs remain historical.
Workspace execution is unavailable, so no local pass for this fix is claimed;
fresh all mandatory actual-main checks/reviews remain required before ready.

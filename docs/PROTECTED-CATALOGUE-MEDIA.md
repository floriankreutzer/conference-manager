# Protected catalogue media presentation

Production Employee and Catalogue Manager presentation can read current private
catalogue images from the authenticated same-origin protected Customer API.
The shared Core read adapter captures the normal API transport, bounds request
time and accepts at most40 validated immutable metadata entries. Only fixed
`/api/v1/tenant/catalogue-media/<UUID>` URLs, known owner kinds and bounded IDs,
PNG/WebP MIME and inert alt text are accepted. Duplicate IDs/owners, extra fields,
accessors, external/Demo URLs and malformed entries fail before image rendering.
An unavailable response never selects Demo storage or retries automatically.
Authentication failures retain the existing whole-application authority handling.

An Employee Room plan uses this URL only when both owner Room ID and asset UUID
match its current server Room attachment. Ordinary managed Room photos retain
the existing Room media endpoint. Current catering images use the same validated
owner map. The Catalogue Manager shows current catering images without adding
synthetic upload/replace/delete controls. Existing explicit Demo mode keeps its
established Demo image editor and paths. No client classification, owner or
metadata is an authorization grant; every image request still requires current
server Tenant/session/source/attachment authority and verified bytes before304.

Local Node22 full quality/i18n/architecture/security/design/regression gates878
passed, including4 new adapter/Room ownership progression and negative tests.
An existing source-contract regression now requires the exact new media-map
argument in both preview calls; no preview/privacy assertion is removed. The
first local run exposed that expected signature change; it was updated after
reviewing the actual additional argument. No dependency is added.

Three new Chromium/WebKit browser cases are prepared: exact current Room plan
mapping/no detached plan/external or Demo request; actual Manager section showing
inert private catering image alt text without image mutation controls and at
320/1280px; malformed external URL refusal before bytes. Component protocol
fixtures are explicitly separate from owned backend native image proofs. Local
browser executables are absent. Fresh full CI suites and unchanged permanent
three-customer/two-reset paired acceptance remain required. Initial onboarding
browser overflow/link/alert failures and correction in PR367 remain historical.

API286 owns current-custody HTTP metadata/bytes; its fresh native image proof is
pending. SYN object pre-staging, actual qualified different-site browser/RP/cookie
proof and real owner/sender/physical keys/recovery/coordinated UUID+credentials+
immutable artifact cutover remain open. This does not activate a served profile,
provider, database migration, real mail or deployment. SaaS1 issue351/milestone2.

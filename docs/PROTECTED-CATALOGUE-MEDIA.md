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

## Manager Room selection and preview (CO-306)

The Manager Room editor uses named native controls for its current floor plan and
up to20 attached images. Candidates are limited to the loaded Room attachments
and successful uploads for that same Room. Catalogue metadata supplies a preview
only when owner kind, owner Room and current floorplan UUID match exactly; it does
not populate an asset inventory. A current Room photo can also be selected as its
floor plan. New or detached assets cannot be searched across Rooms or Tenants.

Opaque legacy references retain their original values/order and remain selected
with an explicit unavailable preview. IDs appear only in technical details. An
image load error changes presentation, never attachment values. Preview nodes are
retained during selection changes so failed bytes are not retried automatically.
An optional metadata failure preserves the editor and its attachments; metadata
authority failures retain the application's existing authority boundary. Only the
explicit Demo runtime can select the exact owner-bound Demo catalogue path.

Selection changes are drafts until the normal revision-bound complete Locations
save. Deselecting detaches a reference without deleting a booking or issuing a
file deletion. The existing business-field projection preserves every Room and
Site/technical field, including editors hidden by search. Managed uploads keep
their existing API contract; the private media editor exposes an in-place update
for a confirmed upload without replacing unrelated draft controls. Session,
Tenant, Room, upload validation and current byte access remain server-owned.

The focused model and DE/EN browser cases cover exact owner/attachment binding,
foreign/external/Demo path rejection, opaque references, failed previews,
selection/save preservation, in-place upload presentation and responsive native
controls. Protocol fixtures prove frontend behavior only. Fresh candidate CI and
the unchanged paired three-customer/two-reset gate remain release requirements;
the Contoso detach test now addresses the native multi-select and keeps its
submitted snapshot, persisted detach, byte-denial and reset assertions.

## Historical initial implementation evidence

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

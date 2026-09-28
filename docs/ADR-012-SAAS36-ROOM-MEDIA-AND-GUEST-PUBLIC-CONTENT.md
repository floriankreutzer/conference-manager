# ADR-012 — SaaS 3.6 managed Room media and public Guest content

Status: **ACCEPTED PRODUCT DIRECTION — implementation and release evidence pending**.
Decision date: 2026-09-26. Product owner approved the recommended H-034 and H-035 directions
in the SaaS 3.6 working conversation. This decision does not change the frozen #179 parity
contract, the current API schema, the public readiness marker, or the release requirements
of #182/#170. Implementation heads and executed evidence remain in `SAAS-3.6-HARDENING-REGISTER.md` and
`SAAS-3.6-ROLLOUT.md`.

Published Confluence decision: https://acckreutzer-1733338800840.atlassian.net/wiki/spaces/~5de0302805eece0d0920638f/pages/12451843/04.1.5.2+ADR-012+SaaS+3.6+Room+Media+Public+Guest+Content

## H-034 — managed Room media for EMP-03

### Accepted product choice

Use Tenant-owned private media stored as bounded PostgreSQL bytes behind the existing
same-origin Customer API. Start with image input only: PNG, JPEG and WebP, each at most 2 MiB
and 4 megapixels; the server decodes and re-encodes an approved raster representation and
strips metadata before persistence. Set an initial aggregate quota of 100 MiB per Tenant
and at most 20 media images plus one floorplan per Room. Exceeding any limit rejects the
upload before changing Room state. The quota and limits are initial approved defaults, not
existing entitlements or evidence that they suit every Tenant; operational evidence may
require a reviewed change before release.

The server creates an opaque immutable asset ID. A Manager with
`tenant:rooms:business:manage` can upload and attach it to a Room through a revision-bound
Locations mutation; Tenant Admin technical Room authority does not confer media upload or
attachment rights. The write checks the authenticated Tenant, byte signature and successful
decode, size/dimensions, quota, the Room's persisted Tenant ownership, Locations revision,
and same-Tenant asset existence. An invalid, missing, foreign, or stale reference fails the
complete mutation without audit success or orphaned attachment. Neither the ID nor the
browser may select an external URL or an outbound fetch.

An authenticated Employee can fetch attached media for an active selectable Room in their
Tenant, including its floorplan during Room selection; a Manager can fetch media for Rooms
in their Tenant, including inactive Rooms needed for business administration. Guests and
anonymous visitors cannot fetch bytes. Every read rechecks the current Room-to-asset
relationship and returns a fixed safe content type with `X-Content-Type-Options: nosniff`,
private `no-store` caching, and a generic concealed response for inaccessible IDs. Render
the real decoded raster in Room cards and an accessible preview/floorplan dialog, with
bounded loading/error/empty states and descriptive localized text. A synthetic schematic
is never counted as EMP-03 image evidence.

A versioned migration would add a Tenant-composite asset registry, immutable content hash,
content type, length, creation/audit metadata and private bytes; the existing Room JSON IDs
remain references, not URLs. The Locations transaction validates every new reference against
that registry. Existing opaque IDs have no bytes: do not fabricate an image or silently resolve
them; explicitly show unavailable media until migrated by an authorized Manager. Preserve
assets referenced by current Room state or immutable Location revisions. Detached assets
without retained references are eligible for deletion after a 30-day recovery period.
Verify quota accounting of historical assets, backup/restore capacity and legal deletion
requirements before release; any conflict requires a reviewed update to this decision.
Rollback must refuse if deleting the registry
would discard live or historical references; otherwise use a compatible binary/forward fix.

Alternative: use a private object store with the same server-issued ID, same-Tenant API proxy,
authorization and failure semantics. This requires an explicit bucket, lifecycle, backup,
restore, cost and key-management decision. An arbitrary external URL or a naked object-store
link is not an alternative under the approved security boundary.

### Required proof before H-034 closure

- API: positive Employee/Manager reads; Employee inactive-Room and anonymous denial;
  cross-Tenant/BOLA, unattached and guessed-ID concealment; upload/format/polyglot,
  size/pixel/quota, stale revision and audit failure negatives; no network fetch; content
  headers; reference/archive/history/rollback and concurrent quota evidence on PostgreSQL 18.
- Frontend: genuine image loading/preview/floorplan in Chromium and WebKit/iPhone; no fetch
  for malformed or foreign references; keyboard focus return, alternative text, mobile
  reflow/200% zoom, DE/EN, empty/error behavior and no synthetic image presented as real.
- Operations: isolated Demo synthetic media, migration/up/down guard, backup/restore test,
  reviewed storage and retention cost, exact pair CI and named #182 human acceptance.

## H-035 — public Guest Information text

The implemented label scanner rejects known credential disclosures but cannot prove that
unrestricted prose has no unlabeled code. For example, a sentence can disclose a door
combination without using any credential label. This is a product/content policy choice,
not a missing regular expression.

### Accepted product choice

Replace the newly introduced Site Guest-v2 and Room floor/accessibility public prose with
bounded, credential-incapable structured values and centrally localized fixed templates.
Examples are public transport/parking/reception availability states, numeric floor and
approved accessibility features. Do not migrate existing free text automatically into a
public template. Hide it from the Guest projection until an authorized editor has selected
the corresponding safe structured values. Keep an explicit `not_available`/missing-data
state. Preserve old configuration/history privately for audit and provide a reviewed
forward migration and compatibility window for already deployed v2 readers/writers.

Even after this change, the older Site/Room display names, postal address, route and
business contact remain separately governed public inputs. Site values belong to Tenant
Admin and Room business values to Conference Manager; the owning role must withhold an
unsafe value and correct it before public projection. The
structured v2 change cannot certify all inherited public strings or a whole deployment
free of secrets.

### Inherited-field residual-risk acceptance — 2026-09-28

The product owner, Florian Kreutzer, explicitly accepted the residual risk for the
older public Site/Room display names, postal address, route and business contact in
the SaaS 3.6 working conversation on 2026-09-28. These remain bounded public
inputs under the existing Site Tenant Admin and Room Conference Manager ownership.
This acceptance permits the approved structured Guest-values implementation to
proceed; it does not authorize publishing a known credential or secret, reinstate
unmigrated Guest prose, or declare all inherited public strings safe.

The owning role must review these values before publication, withhold or correct
an unsafe value when found, and repeat review when the value changes or an
exposure is reported. An accidental disclosure requires withdrawal/correction,
credential rotation where applicable, and security incident handling under the
existing process. The label scanner remains defense in depth; unlabeled secrets
remain possible. This records product risk acceptance, not an independent
Security Owner sign-off or the named #182/#170 release acceptance. Those gates,
including exact deployed-candidate and live security evidence, stay open.

Alternative: keep bounded free text with an accountable editor/approver workflow and an
explicitly accepted residual risk. Record approver identity, affected fields, publication
and withdrawal events, review cadence and response to accidental disclosure. The current
label scanner remains defense in depth, never a declaration that arbitrary prose is safe.
Until the accepted structured path is implemented and validated, withhold new public Guest
prose rather than marking H-035 closed.

### Required proof before H-035 closure

- Exact versioned API/Locations contract, role and Tenant authorization, migration and
  rollback behavior, legacy stored-value concealment, log/print redaction and #185 tests.
- Frontend editor, Guest dialog and detached print behavior in both browsers, with
  configured/missing/withdrawn states, keyboard/focus, DE/EN and no credential echo.
- Documented product acceptance of the remaining inherited public-field risk
  (recorded above), Security Owner disposition, then exact-head CI, deployment
  identity and named human #182 review.

## Decision record

| Gate | Decision | Status |
| --- | --- | --- |
| H-034 | Bounded PostgreSQL private raster assets as above | Product direction accepted; implementation/operational evidence pending |
| H-035 | Structured Guest-v2 values with legacy public text withheld | Product direction and inherited-field residual risk accepted by Product Owner 2026-09-28; Security Owner release disposition and implementation evidence pending |

Acceptance of this ADR authorizes its product direction only. The implementation,
PostgreSQL/browser tests, protected review, deployment and named human acceptance remain
separate release gates. No production migration or public release follows from a document
approval alone.

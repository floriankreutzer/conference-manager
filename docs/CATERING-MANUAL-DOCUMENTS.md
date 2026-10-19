# Manual Catering documents

## Scope

The default-off Manager delivery rollout includes bounded CSV and detached native
print/save-as-PDF documents for the current manual-provider order view. Export is
not manual transmission, supplier confirmation, a binding cost acceptance or a
delivery job. Regeneration only reads authoritative state; it never enqueues,
sends or retries an order. Actual manual channel/time/reference attestation and
subsequent provider confirmation remain separate server-side work.

The existing authenticated same-origin order API remains authoritative. No new
backend route, schema migration, permission, browser storage or live supplier
adapter is added. Demo delivery discovery remains off. Source implementation and
synthetic browser evidence do not establish deployment or complete SaaS4 acceptance.

## Source, freshness and minimization

Manager owns document projection, action lifecycle and print presentation. Platform
exposes its existing closed order-view normalizer as an explicit public wire
contract; the document model reuses it rather than inventing another validator.
Export preflight reloads the exact order and compares the entire normalized view
with what the Manager displayed. A changed version, quote, decision, expiry or
factual state refuses output, preserves existing form state and requires explicit
authoritative reload. Unknown/private fields and getters fail closed.

The document contains order/version and connection references, operation and
business status, conference title, Room, times, participant count, requirements,
commercial position identity/name/quantity, descriptive package variant/components
and selections, and the exact supplier quote/approval state. It excludes internal
selling prices and inferred per-position supplier costs, initiator identity,
allocation data, audit actors, sessions, credentials and provider URLs. The supplier
total appears once in the CSV summary, never once per position. Package components
remain descriptive and cannot become extra commercial charges.

Generation time is browser-produced document metadata, not a server audit or
transmission timestamp. Version and generation time are visible with a notice that
later versions can supersede the document. A superseded displayed source cannot
produce a fresh export. Previously saved files are immutable historical copies;
they cannot be remotely relabelled or revoked after a later business change.

## CSV and PDF controls

CSV uses stable machine headers, UTC ISO times and exact integer minor units.
There is one `summary` record and up to101 `position` records. Package components
and selections use bounded JSON cells. Localized notice text accompanies the
export. Every cell uses the shared spreadsheet formula-prefix and quote-escaping
contract, also used by the existing Tenant bulk CSV path. Existing bulk import
round-trip behavior is preserved. UTF-8 output is bounded to2MiB. A shared download
primitive accepts only serialized text and a fixed-format safe CSV filename,
creates a temporary in-memory Blob URL and removes/revokes it even on failure.
This does not permit arbitrary blob navigation or external destinations.

PDF is the existing detached native print/save-as-PDF flow, not a new server PDF
engine or an automatically downloaded binary. The reserved same-origin print
document nulls its opener, uses safe DOM/text rendering and the unchanged strict
CSP: no scripts, external data/images/fonts, frames, forms or connections. Only
the existing fixed stylesheets are allowed. Printing stays disabled until styles
load successfully. Each print action independently repeats exact-source preflight.
Authority loss, detachment, closed windows and stale source prevent output;
existing lock/unload custody closes registered detached windows. No automatic
printing or external transmission occurs.

## Evidence boundaries

Native tests cover minimized projection, exact large supplier totals, no duplicated
charges, descriptive components, CSV formula/quote handling, source changes,
private/getter rejection, UTF-8/filename bounds and URL cleanup. Existing bulk CSV
tests continue to verify literal apostrophes, embedded newlines, BOM, limits and
re-import meaning. Browser scenarios exercise real Manager composition and wire
adapters with controlled HTTP responses: DE/EN repeated exports, literal malicious
markup, restrictive print CSP/opener, keyboard focus, stale pre-print source,
popup blocking, authority loss and detached preflight. The extracted shared browser
fixture preserves all prior delivery scenarios and assertions.

Local WebKit exercises native print-view preparation and invocation with a print
boundary stub. The Chromium branch additionally generates and retains an actual
PDF through the browser print engine in CI; that branch is not locally executed
where Chromium is unavailable. Full source-head quality/browser/security and
immutable paired permanent Demo acceptance remain mandatory. No formal WCAG,
assistive-technology, penetration-test or supplier-delivery certification is claimed.

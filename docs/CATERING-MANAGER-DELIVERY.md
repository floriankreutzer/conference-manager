# Manager delivery processing

## Contract and rollout

This optional panel consumes the explicit enqueue and bounded job reads in API
PR217 (canonical049/Demo015). It is source implementation, not deployment or
supplier-delivery acceptance. The independent registered `catering.delivery`
presentation flag defaults OFF. Discovery requires a non-Demo authenticated
Manager, the available order capability and a valid bounded job-list response.
Discovery times out and aborts; authority failures invalidate the existing shell.
No global feature flag, browser persistence or provider adapter is introduced.

Platform owns the positive wire adapter and scoped discovery. The existing app
composition injects the adapter through the public Manager runtime. Manager's
order application owns its uncertainty/write lifecycle; the separate delivery
panel owns job-read presentation and pagination. No business authorization or
dispatch logic moves into the browser or Composition Root. The existing
architecture gates remain applicable without exceptions.

## Explicit actions and uncertainty

Only a released version with a current approved, unexpired displayed quote can
present enqueue. A successfully validated empty job read is required before the
button becomes available. The command contains only schema version, order ID,
displayed order version, state revision and quote revision. The trusted backend
independently validates exact session, CSRF, Tenant, role, source and approval.
No Tenant, supplier, operation, amount, actor or job identifier is browser authority.

An enqueue acknowledgement is validated before authoritative order reload. Lost,
conflicting, malformed or failed responses are never retried automatically. All
writes remain disabled until the User explicitly reloads the current order;
existing drafts remain intact. A successful enqueue updates both order list and
detail, restores focus to the existing reload action and loads the new job state.
Job reads replace at most twenty ordered references per page. They never start a
worker, send an order or attest manual transmission. Failed reads keep enqueue
disabled. Detached views and locked sessions cannot accept late read results.

## Meaning of status

Order status and delivery-processing status remain separate. Queued/claimed means
admitted for processing, not sent. A succeeded job means an acknowledgement was
processed, not that every position is confirmed. Partial, pending, rejected and
confirmed order states remain distinct. A supplier rejection can retain the
historical approved cost decision; it does not offer a renewed initial-order
quote/approval form. A Manager's own quote rejection remains reviewable.

The current production provider registry is manual-only. API PR218 composes the
awake-process worker as a separate change; this frontend does not establish that
PR's acceptance or deployment. Manual deferral is explicitly described as requiring
follow-up and does not confirm manual sending. There is no binding delivery time.
The [manual document flow](CATERING-MANUAL-DOCUMENTS.md) adds version-bound CSV and
native print/save-as-PDF without transmission. Actual manual attestation, receipt
detail/ongoing ingestion, reactivation and change/cancel/exception versions remain
separate work.

## Verification and presentation

Central synchronized DE/EN resources provide every label/status. Native headings,
buttons, live status, articles and definition lists reuse the existing Manager
cards, controls, focus and responsive-detail styles. A scoped label wrapping rule
prevents long German labels overlapping values; all visual values use existing
tokens. Time and counts use the existing locale-aware formatters. No dependency,
framework, storage key, credential, URL or browser authority is added.

Native tests cover minimized scope, private/unknown fields, impossible counts,
ordered twenty-entry keysets, exact/replayed acknowledgements, non-retry errors,
default-off discovery and supplier rejection history. Browser tests exercise the
real workspace and wire adapters with synthetic HTTP responses: DE/EN enqueue,
manual deferral, keyboard/focus, phone/landscape reflow, read failure, conflict
reload, rollout off, supplier rejection and detached reads. These are not actual
session/CSRF/PostgreSQL or live provider evidence. Full exact-head frontend CI and
immutable paired three-customer/two-reset acceptance remain mandatory. No formal
WCAG/assistive-technology, security, live-provider or release compliance is claimed.

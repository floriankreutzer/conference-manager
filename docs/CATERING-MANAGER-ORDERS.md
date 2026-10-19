# Manager Catering order and cost review

## Source scope

The optional Manager Catering tab consumes the default-off order API introduced by API PR213,
canonical048/Demo014. This document describes source contracts, not deployment or release acceptance.
It supports explicit initial preparation for a selected Confirmed Request, bounded order listing,
historical commercial details, manual supplier quote recording and exact quote approval/rejection.
Cost approval is visibly distinguished from transmission or supplier confirmation.

The registered `catering.orders` presentation flag defaults OFF. A valid authenticated non-Demo
Manager list projection enables only a scoped resolver. Discovery is abortable and bounded; missing,
malformed or unavailable projections hide the optional tab. Authentication/authorization failures
invalidate authority through the existing shell. No global flag is changed. Every server operation
independently validates session, CSRF, Tenant, role, object, current source and state revisions.

Preparing requires the optional assignment projection and a current complete ownership revision
matching the displayed Request's Catalogue revision. Its command carries the exact displayed Request
version, assignment revision and a fresh command UUID. The browser never guesses historical
ownership or supplier identity. A lost response is not automatically retried; load current state.
When assignment setup is unavailable, order history remains readable but preparation stays disabled.

## Review behavior

The list replaces pages of at most twenty references. Details expose exact version, connection
reference, Room, device-local start/end, Catering participants, requirements, package contents and
commercial positions. Conference prices are explicitly separate from initially unknown supplier
cost. Manual quote entry uses native labelled currency/number/date-time controls. Device-local
expiry is converted to strict UTC; invalid dates and fractional minor units are rejected.

Quote totals use exact integer minor units and locale-aware currency formatting without converting
large totals through imprecise floating-point major units. Package contents remain descriptive;
there is one charged package position, at most100 direct items and up to300 package components.
The wire adapter checks closed shapes, exact scope, quantities, totals, bounded history references
and quote/decision consistency before rendering. It confers no authorization or business authority.

Approval buttons name the exact displayed supplier total. Decision commands contain the current
state and quote revisions plus the requested decision; they cannot submit a replacement cost or
actor. A new quote clears the previous decision and visibly requires renewed approval. Expired
quotes cannot be approved in the UI; the server repeats expiry checks. No blind write retry occurs.
Conflict or uncertain write results preserve the draft and disable further writes until explicitly
loading authoritative state. Current status is updated in both the list and detail after success.
Detached views, changed refresh generations and locked sessions cannot consume late results.

## Ownership and hotspot assessment

`app.js` discovers and injects the adapter through the public Manager runtime. Workspace owns the
optional callback composition; the existing operational renderer gains only a conditional tab and
callback branch with its existing generation/authority guards. KEEP this navigation responsibility;
EXTRACT all new rendering/form lifecycle into Manager-owned `catering-order-application.js` and
exact draft conversion into `catering-quote-draft.js`. No new commercial logic lives in either
existing hotspot. Platform owns the typed adapter, closed wire projection and runtime discovery.

Native headings, buttons, selects, forms, details, lists and field labels reuse the current design
system, cards, grids, button rows and visible focus. Central DE/EN resources contain all new copy.
No CSS, dependency, framework, storage key, credential, supplier URL or provider network adapter is
added. Provider qualification, credential custody, publication and delivery remain separate work.

## Evidence boundaries

Native tests cover wire scope/corruption,101/102 positions,300 components, exact acknowledgements,
bounded ordered pages, stale-cost decisions, non-retry behavior, scoped discovery, decimal/calendar
input and exact aggregate currency display. Browser scenarios exercise real Manager workspace,
native keyboard/forms, wire adapter, DE/EN phone/landscape reflow, conflict recovery, renewed approval,
authority invalidation and late detached responses against synthetic HTTP fixtures. These do not
replace actual PostgreSQL/session/CSRF backend evidence, complete current-head frontend CI,
Chromium/WebKit or permanent three-customer/two-reset acceptance. Formal WCAG/assistive-technology
or security compliance and actual supplier delivery are not established by these checks.

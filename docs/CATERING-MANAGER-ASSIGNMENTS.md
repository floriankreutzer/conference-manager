# Manager Catering ownership assignments

## Implemented source scope

The optional Manager business-settings section assigns the complete current
Catering catalogue to existing configured connections. Its backend contract is
API PR #211, migration 047. This document describes source behavior; it does not
claim deployment, supplier delivery, catalogue publication or release acceptance.

The registered `catering.catalogue` presentation flag defaults OFF. Only a valid
authenticated server projection enables a scoped resolver for a non-Demo
Conference Manager with catalogue permission. Missing, malformed, unavailable or
timed-out optional projections leave the section hidden. Authentication and
authorization failures propagate to the existing authority invalidation flow.
Discovery has a bounded abortable deadline and never changes the global flags.
The server independently authorizes every read and write.

## Ownership and composition assessment

`src/app.js` remains composition only: discover the optional adapter and inject
it through the public Manager runtime. The existing workspace and business
settings modules retain navigation, heading and lifecycle composition. The
business-settings hotspot gains one optional branch; no assignment validation,
draft grouping, transport or form lifecycle is added there.

Manager owns `catering-assignment-draft.js` and
`catering-assignment-application.js`. Platform owns the closed wire adapter and
bounded runtime discovery. Core owns the existing DE/EN translation catalogue,
native form helpers and locale formatting. No capability-private imports,
storage convention, persistence key, dependency, framework or CSS system is
introduced. Existing architecture/privacy gates remain mandatory.

## Editing and conflict behavior

Packages and all their items use a common connection. Overlapping packages form
one group, including inactive members. All 300 items and 100 packages remain
supported. A new member or inconsistent previous ownership requires an explicit
choice; the client never guesses a supplier. Variants inherit package ownership.
Grouping does not change catalogue availability, prices or membership.

The connection lookup replaces pages of at most twenty entries. Current selected
references remain selectable while another page is visible; their presence does
not prove continued eligibility. The server revalidates connection eligibility
and the complete canonical ownership on save. Short connection references
distinguish configured connections without claiming a supplier's legal identity,
health, contact details or API capability. Supplier qualification and business
labels remain outside this increment.

The save contains independent expected assignment and canonical catalogue
revisions. The wire adapter checks exact persisted acknowledgement, including
revision increment and complete normalized ownership. There is no automatic write
retry. Conflicts preserve the draft, disable reapply and require explicitly
loading the current state, discarding the draft. Other uncertain outcomes preserve
the selection and direct the user to load authoritative state before retrying.
Detached views and locked sessions cannot apply late results.

Native selects, fieldsets, legends, labels, submit behavior, status announcements
and existing cards/form grids provide the form structure. Revisions use the
existing locale formatter. DE and EN copy is centralized. Formal WCAG or
assistive-technology conformance is not asserted by source or browser tests.

## Evidence boundaries

Native tests exercise closed DTOs, zero and terminal revision boundaries,
duplicate/foreign-shaped input, strict bounded pages, acknowledgement mismatch,
authority failures, non-retry behavior, discovery timeouts/late results, package
grouping, explicit reassignment and full 400-entry capacity. Browser progression
uses deterministic synthetic API responses with the real Manager composition,
native browser forms and real wire adapter. It is distinct from real PostgreSQL
and session/CSRF acceptance in API PR #211. Required current-head frontend CI and
immutable paired three-customer/two-reset browser gates remain required before
integration. Neither these fixtures nor UI flags grant server authority.

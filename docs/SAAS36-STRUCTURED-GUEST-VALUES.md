# Structured Guest display for SaaS 3.6

The Tenant Admin Site editor and Conference Manager Room editor load and save Locations schema 3 with the same revision-bound mutation contract. Each public section starts withheld (`null`). Enabling it selects finite availability/arrival states and accessibility features; the Room editor also accepts a bounded integer floor. Disabling it publishes `null` on save. Existing private v2 prose stays in the editor and history but is not used as public arrival, parking, floor or accessibility copy.

The authenticated Request Guest view and detached print negotiate Request room-context v3. The adapter checks the exact envelope and finite structured values before presentation. Both surfaces use `src/core/i18n-base.js` German and English templates and DOM text, never interpolate an arbitrary configured string for the new fields. Older explicit v2 clients remain parseable during the compatibility window. Null and withdrawn values display a missing marker; room media and inherited Site address/contact/route and Site/Room names continue under their existing contracts. ADR-012 documents the inherited public-field risk and owning-role withhold/correct policy.

The paired API change is merged PR #80, including migration 040. Frontend PR #202 passed quality, dependency and secret checks and 268/268 Chromium/WebKit cases on its reviewed candidate head; its original hosted acceptance and three-origin DAST are historical delivery evidence. Named #172/#182 acceptance and the bounded #216 Demo snapshot/retention disposition are accepted and closed. Those decisions are not new approval requests and do not claim isolated HTTP restore, retention deletion or Production RPO/RTO evidence that was not executed. Production PostgreSQL selection and recovery remain eventual Production release work.

The new #256 Guest print defect is corrected by PR #257 through a fixed same-origin
script-free print document, two CSP-permitted stylesheets and bounded document/CSS
readiness. Historical dark/Camel layout, four facts, visit cards and A4 printing use
the same minimized Guest projection. Actual Chromium PDF rendering and both browser
engines are checked. The Guest/Catering/worklist and independent #229 business
help/CSV corrections are integrated; their accepted baseline and executed final
browser/Hosted evidence are recorded in `SAAS-3.6-RELEASE-EVIDENCE.md`.
#170 records the normal protected readiness publication and actual final live pair.
Demo UX readiness does not establish tagged-PDF, Production or external-provider
certification, and the accepted ADR-012 evidence limits remain unchanged.

## Guest print regression evidence

The existing browser matrix exercises Guest print in German and English with
bounded public title, Room/Site, address and contact values large enough to require
multiple A4 pages. Chromium retains the actual PDF and checks its page tree, a
two-to-four-page bound and portrait A4 dimensions on every page. The ordinary
Guest case retains the same structural checks with a one-page minimum. These
checks inspect Chromium's emitted page dictionaries. A bounded renderer-specific
check also follows the page transforms and actual rectangular clip, requiring
every uniform card frame, including its full stroke width, to fit inside that
clip. A small existing-token inline inset keeps the print artwork away from the
fractional page edge. These checks are not a general parser or security validator
for uploaded PDFs; text completeness and the differently painted WLAN border
still require independent PDF review.

Both Chromium and WebKit retain the screen image, print-media image and visible
print text. They verify that phone-only layout rules do not reduce the print grid
to one column, long public fields remain present without horizontal overflow,
the print action is hidden only in print media, and keyboard activation remains
usable after returning to screen media. A delayed stylesheet cannot move focus
from the current owner control; the session lock still closes the detached surface.
No WebKit PDF-generation capability is claimed. The existing CI canary and complete
matrix run these cases and retain their attachments without a new dependency or
workflow entry point.

Download the exact successful run's original PDFs for independent page rendering
and text extraction with standard PDF tools. Verify each page, field endings and
the final WLAN section against the attached public print text; verify that private
Request requirements, dietary notes, internal identities and the print button are
absent. Source assertions and continuous print-media screenshots alone do not prove
physical page fragmentation or replace that actual PDF review. A new candidate's
browser/PDF evidence remains pending until its own CI run completes.

The detached document deliberately remains text-only under its fixed CSP: Room
photos, QR images, external fonts and network connections are not authorized by a
visual target. The existing four facts and visit/WLAN cards remain the implemented
layout; source and PDF checks do not claim exact visual parity or tagged-PDF/accessibility
certification.

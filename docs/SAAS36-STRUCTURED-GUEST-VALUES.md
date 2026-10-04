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

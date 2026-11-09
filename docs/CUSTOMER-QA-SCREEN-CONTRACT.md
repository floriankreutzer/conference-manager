# Customer QA screen comparison and acceptance contract

## Purpose and authority

This document maps the 27 customer application design proposals to the existing
capability owners, source contracts and executable coverage. It defines what a
review must inspect. It is not a product acceptance result, a deployment record
or a claim that every proposed layout is implemented.

The target numbers and German screen names match the design attachments used in
the CO-320 QA work. Keep the target artwork and dated review evidence with the
work item. Do not duplicate internal screenshots, customer data or audit records
in this public repository. A changed proposal needs an explicit reference in the
acceptance record so that two reviews do not silently compare different targets.

Repository contracts remain authoritative for implemented behavior. Design
proposals do not create API fields, delivery destinations, permissions,
entitlements, persistence, provider capabilities or data access. Security,
correctness, accessibility and data integrity retain the priority defined in
[`AGENTS.md`](../AGENTS.md). Apply the current
[architecture](ARCHITECTURE.md), [design system](DESIGN-SYSTEM.md),
[coding standards](CODING-STANDARDS.md) and
[Production security boundaries](PRODUCTION-SECURITY.md).

Evaluate a difference in one of these ways:

- **Required behavior:** the current product/API contract must work, including
  failure, conflict and authority-loss states.
- **Deliberate contract difference:** the proposed appearance would imply data
  or authority that the application does not have. Preserve the existing
  boundary and record the reason in the review.
- **Open presentation difference:** the proposal contains a layout or
  interaction not present in the reviewed source. Record the difference and its
  disposition in Jira; do not silently call it implemented or accepted.

Example names, counts, money amounts, dates and Tenant branding in the artwork
are illustrative. Validate the actual authorized data, localized formatting and
meaning of each total instead of hardcoding those examples.

## Shared inspection requirements

Every screen review must identify the exact frontend commit and immutable API
counterpart, actual runtime composition, Tenant scenario and role, language,
browser and viewport. Record whether the surface was reviewed in a routed
protocol fixture, an isolated paired runtime, Hosted Demo, protected DEV/INT or
REAL integration. These environments establish different facts.

Inspect DE and EN, long values, empty/loading/unavailable states and the relevant
success, validation and conflict states. Exercise keyboard order, visible focus,
dialog entry and return, accessible names and errors, zoom/reflow and touch
interaction where applicable. Horizontal scrolling belongs only to an intentional
bounded two-dimensional region. A screenshot alone does not establish these
behaviors or formal WCAG conformance.

Role checks must include Employee, Conference Manager, Tenant Admin and combined
roles where the surface permits them. A hidden control is not authorization.
Review Tenant isolation, stale responses, server-owned revisions and authority
invalidation with the existing API contracts. Do not expose identifiers or
technical diagnostics merely because a target contains an extra text field.

The source and tests below are review entry points. Their existence is not a
passing result. Candidate changes must be inspected in the integrated tree and
qualified by their own current checks; a prior merge or an older successful run
does not qualify a later candidate.

Existing browser cases attach selected asserted states through
[`customer-screen-evidence.js`](../tests/e2e/fixtures/customer-screen-evidence.js).
Adjacent JSON records identify the target, actual language, viewport, engine,
fixture roles and checked-out source. Routed protocol fixtures and isolated
component adapters explicitly have no real API commit. Existing screenshot and
PDF names remain available. Before/after state names describe an interaction in
the candidate, not a comparison with an older release. These artifacts support
the review; they do not replace the assertions, paired-runtime journeys or the
acceptance record.

## Employee and shared customer surfaces

The common browser coverage in this table is
[`production-application.spec.js`](../tests/e2e/production-application.spec.js).
Use the named cases to locate the relevant assertions; preserve their existing
security, data and interaction expectations.

| Target | Required review and source owner | Executable coverage | Contract difference or remaining comparison |
| --- | --- | --- | --- |
| 01 — Willkommen | One greeting, current Tenant presentation, new-request and existing-request actions, current open/upcoming/today totals and next booking. [`app-shell.js`](../src/platform/app-shell.js), [`welcome-projection.js`](../src/platform/welcome-projection.js). | [`welcome-projection.test.js`](../tests/welcome-projection.test.js); Production `CO-309: Welcome uses one greeting`; [`tenant-presentation.spec.js`](../tests/e2e/tenant-presentation.spec.js). | KPI values come from authorized request state and site time zones. Check the target hierarchy, empty state and role-owned navigation with current data; the example values are not acceptance constants. |
| 02 — Anfrage: Termin | First of six request steps: title, single/multi-day schedule, participants, validation and safe draft continuation. [`production-application.js`](../src/employee/production-application.js), [`server-request-workflow.js`](../src/employee/server-request-workflow.js). | [`server-request-workflow.test.js`](../tests/server-request-workflow.test.js); Production CO-299 schedule errors, CO-308 six-step navigation and single/multi-day reload cases. | Preserve field-associated errors and the explicit discard boundary. A proposed spacing or date layout must not change ISO/time-zone semantics or turn an unconfirmed submission into a new write. |
| 03 — Anfrage: Raum | Authorized room inventory, named equipment, participant capacity, site/search filters, retained selection and guarded media preview. [`production-application.js`](../src/employee/production-application.js), [`server-request-editor.js`](../src/employee/server-request-editor.js), [`room-media.js`](../src/employee/room-media.js). | Production EMP-03 and CO-308 room-filter/focus cases; [`protected-catalogue-media.spec.js`](../tests/e2e/protected-catalogue-media.spec.js). | Availability and room eligibility remain server/policy-derived. Resolve media only for the authorized room; unavailable images or provider state must stay explicit. Compare target card density and previews without introducing a global asset catalogue. |
| 04 — Anfrage: Services | Applicable service and equipment choices, named values, quantities and retained selections across normal step navigation. [`production-application.js`](../src/employee/production-application.js), [`server-request-editor.js`](../src/employee/server-request-editor.js). | [`server-request-workflow.test.js`](../tests/server-request-workflow.test.js); Production CO-308 all-six-steps case and rich request progression. | Preserve room/site/policy applicability. Compare grouping, selected states and summary readability without displaying unavailable catalogue choices as selectable. |
| 05 — Anfrage: Bewirtung | Applicable packages, variants and items, catering participant count, quantities, validation and protected imagery. [`production-application.js`](../src/employee/production-application.js), [`server-request-editor.js`](../src/employee/server-request-editor.js). | Production CO-299 catering errors and CO-308 collapsed-invalid-catering case; [`protected-catalogue-media.spec.js`](../tests/e2e/protected-catalogue-media.spec.js). | Compare the target package/item grouping and quantity controls. Invalid hidden values must be revealed and focused; catalogue image availability is not permission to upload or expose another owner's media. |
| 06 — Anfrage: Kosten | Named active cost centers, allocation validation and consistent cost summary. [`production-application.js`](../src/employee/production-application.js), [`server-request-editor.js`](../src/employee/server-request-editor.js), [`server-request-review.js`](../src/employee/server-request-review.js). | [`server-request-review.test.js`](../tests/server-request-review.test.js); Production CO-299 allocation errors and rich request allocation assertions. | Required allocation and exact percentage totals follow the current catalogue/policy. Do not infer a cost-center balance, approval rule or editable pricing contract from the proposal. |
| 07 — Anfrage: Prüfen | Complete six-step review, correction navigation, explicit submission and recovery after an uncertain outcome. [`production-application.js`](../src/employee/production-application.js), [`server-request-review.js`](../src/employee/server-request-review.js), [`server-request-workflow.js`](../src/employee/server-request-workflow.js). | [`server-request-review.test.js`](../tests/server-request-review.test.js); Production CO-301 submission/recovery, CO-304 success notice and CO-308 navigation cases. | Keep request, service, catering, allocation and pricing details coherent. A success appearance requires a confirmed server result; unresolved submission must not generate an automatic duplicate request. |
| 08 — Meine Anfragen: Liste | Compact request summaries with status, schedule, room, expandable business details, history and permitted actions. [`production-application.js`](../src/employee/production-application.js), [`server-request-history.js`](../src/employee/server-request-history.js), [`production-request-details.js`](../src/shared/production-request-details.js). | Production CO-300 cancellation confirmation, CO-310/CO-301 personal repeat-request recovery and request-history/transition cases. | Compare summary/detail density and action grouping. Employee history and actions remain personal/authorized even when the session also has Manager authority; no action is enabled solely from a stale displayed status. |
| 09 — Meine Anfragen: Kalender | Localized month navigation, consistent weekday columns, bounded long titles and keyboard entry to request detail. [`server-request-calendar.js`](../src/employee/server-request-calendar.js), [`production-application.js`](../src/employee/production-application.js). | [`server-request-calendar.test.js`](../tests/server-request-calendar.test.js); Production CO-297 weekday/long-title case and calendar navigation coverage. | Use current time-zone and status projection. Compare calendar geometry and readable occupancy at narrow widths; do not force the example month or booking distribution. |
| 10 — Profil | Authoritative name, role and Tenant presentation, language choice, help and applicable logout. [`app-shell.js`](../src/platform/app-shell.js), [`tenant-presentation.spec.js`](../tests/e2e/tenant-presentation.spec.js). | Production `CO-316: profile is read-only and help never simulates contact delivery`; [`app-shell-focus.spec.js`](../tests/e2e/app-shell-focus.spec.js). | Profile identity is read-only. The current contract does not expose an editable personal profile or email field. Language changes must respect active editor navigation protection. |
| 11 — Hilfe und Kontakt | Searchable help, explicit contact availability and usable dialog actions/focus. [`app-shell.js`](../src/platform/app-shell.js). | Production CO-316; [`dialog-tab-boundary.spec.js`](../tests/e2e/dialog-tab-boundary.spec.js). | There is no contact-delivery API in the current composition. The send action is disabled with an explicit unavailable explanation. The proposed contact form must not imply a recipient, successful delivery, data collection or an authorized outbound integration. |
| 12 — Gästeinformationen | Current confirmed booking facts and finite published address/arrival, on-site and contact values, with explicit absence and focus return. [`production-application.js`](../src/employee/production-application.js), [`production-request-details.js`](../src/shared/production-request-details.js). | Production EMP-14/EMP-15/API-02, CO-317 missing-public-data and stale-booking cases; [`tenant-guest-information.test.js`](../tests/tenant-guest-information.test.js). | Public guest values are a separate allowlisted contract. Private room photos, legacy guest prose, confidential request/diet text, internal IDs and WLAN names do not become guest content. The target image does not authorize those disclosures. |
| 13 — Gäste: Druckansicht | Detached A4 guest output from a current authorized confirmed booking, complete safe text, legible pagination and cleanup. [`production-application.js`](../src/employee/production-application.js), [`detached-print-window.js`](../src/shared/detached-print-window.js), [`detached-print.html`](../src/shared/detached-print.html). | [`detached-print-window.test.js`](../tests/detached-print-window.test.js); Production EMP-15, CO-317 and REG-05 print cases. Qualify actual generated PDF/print output, including long and multiple-page content. | The isolated document has no opener and allows only its fixed stylesheets; image, font and connection sources remain denied. Target photos, QR codes, external fonts, branded header and page-number furniture are not established current output. The existing text layout must be reviewed as printed, not inferred from the guest dialog. |

## Conference Manager surfaces

Manager-owned room business fields and catalogue configuration remain separate
from Tenant-owned organization, locations, provider identities and policy.
Retain that division even when a design proposal places related information
next to each other. The relevant shared browser cases remain in
[`production-application.spec.js`](../tests/e2e/production-application.spec.js).

| Target | Required review and source owner | Executable coverage | Contract difference or remaining comparison |
| --- | --- | --- | --- |
| 14 — Anfragen und Buchungen | Four state-derived KPI filters; search, status and site filters/reset; request facts, costs, actions and history. [`production-application.js`](../src/manager/production-application.js), [`server-cockpit-model.js`](../src/manager/server-cockpit-model.js), [`production-request-details.js`](../src/shared/production-request-details.js). | Production MGR-01/MGR-02/MGR-03/MGR-11/MGR-12/MGR-14 cockpit case and request-transition/authority cases. | The current view uses compact request cards with inline details and additional work/upcoming summaries. The proposed selectable/sortable paged table, fixed right detail pane and local new-request header action are not implemented by that structure. Record their disposition instead of calling this a complete visual match. |
| 15 — Raumplanung | Site/date selection, list and timeline modes, all-day/work-hours windows, time-zone/DST-safe placement, overlap lanes and accessible booking previews. [`server-analytics-view.js`](../src/manager/server-analytics-view.js), [`server-room-plan.js`](../src/manager/server-room-plan.js), [`room-plan-preview.js`](../src/manager/room-plan-preview.js). | Production MGR-04/MGR-08/MGR-09 timeline case and CO-311 short/overlapping/overnight pointer, keyboard and touch previews. | Current previews appear in a dedicated section, show total participants and open the request. Previous/today/next date buttons, a local new-request action, room capacities in rows, a status-color legend, floating preview and internal/external participant split are absent. Current timeline ticks are coarser than the hourly target. Preserve bounded scrolling and keyboard access while reviewing these differences. |
| 16 — Reports | Site, period/date and room scope; load/reset; five KPIs; room use, catering, open work and service/item details; clear unavailable and incomplete data. [`server-analytics-view.js`](../src/manager/server-analytics-view.js), [`server-cockpit-model.js`](../src/manager/server-cockpit-model.js), [`manager-layout.css`](../assets/manager-layout.css). | Production MGR-10 reports and CO-318 room-scope/totals/unavailable/reset cases. | The current layout has camel-colored KPI areas and four detail cards rather than the proposal's Bordeaux/two-card arrangement. Additional room filtering, data-basis/completeness text and service/item reports have functional meaning. Preserve historical pricing snapshots and missing-detail distinctions; do not replace them with current prices or fabricated zeroes. |
| 17 — Räume | Room business data, independent price saves, named governed media/floorplan selection and preview, full revision-bound snapshots and coherent draft/save lifecycle. [`business-settings-application.js`](../src/manager/business-settings-application.js), [`catalogue-editor-list.js`](../src/shared/catalogue-editor-list.js). | [`manager-business-settings-model.test.js`](../tests/manager-business-settings-model.test.js); Production room ownership, full-snapshot, price, upload, conflict and authority cases. The scoped draft/media follow-ups also require their candidate-specific unit/browser tests. | Current catalogue navigation is a searchable accordion, not the proposed table/detail split; status filter, pagination and a price column are absent. Media choices must be bounded to this room's current authorized references and confirmed uploads. No global asset inventory exists. Verify the draft/media follow-ups at the integrated candidate; this matrix does not establish their merge, deployment or acceptance. |
| 18 — Services und Ausstattung | Both owned collections, names, applicable sites/rooms, prices, activity, adding/searching and complete revision-bound save/CSV behavior. [`business-settings-application.js`](../src/manager/business-settings-application.js), [`named-selection-field.js`](../src/shared/named-selection-field.js), [`catalogue-editor-list.js`](../src/shared/catalogue-editor-list.js). | Production separate Services/Catering CSRF, normal price/named catalogue, CO-306 complete-snapshot/search/hidden-validation and named-reference cases; [`catalogue-editor-list.spec.js`](../tests/e2e/catalogue-editor-list.spec.js). | Collections currently appear sequentially as accordions. Proposed collection subtabs, availability filtering and the tabular left price/site overview are not present. Hidden search results must still participate in the owned snapshot and invalid entries must be revealed. |
| 19 — Catering | Item/package/variant editing, named item choices, prices, active state, CSV and coherent retained drafts during permitted image operations. [`business-settings-application.js`](../src/manager/business-settings-application.js), [`PROTECTED-CATALOGUE-MEDIA.md`](PROTECTED-CATALOGUE-MEDIA.md). | Production Catering catalogue/variant/price/CSRF cases; [`protected-catalogue-media.spec.js`](../tests/e2e/protected-catalogue-media.spec.js), plus the candidate-specific Catering draft cases when changed. | The proposal's collection subtabs, left package cards/right image summary and compact removal chips are not the current accordion layout. Production provides protected image reads; existing explicit Demo image mutations have a separate boundary. The artwork is not authorization to add Production upload/replace/delete APIs. |

Across targets 17–19, verify internal tabs, application navigation, language
change, reload, pending writes, failed writes, revision conflict and authority
invalidation. An independent price or media save must not discard unrelated
unsaved fields or silently rebase a conflicting catalogue draft. A pending save
must not permit a second contradictory write. Search and disclosure changes are
presentation state, not permission to omit entries from an owned snapshot.
The existing Tenant editor protection and its role boundary must remain intact.

## Tenant Admin surfaces

Tenant section availability and actions derive from the trusted session and
owned adapters. The [settings shell](../src/tenant-admin/settings-shell.js),
[section registry](../src/tenant-admin/section-registry.js) and
[section contract](../src/tenant-admin/section-contract.js) govern navigation;
an attractive overview card cannot make an unavailable section authoritative.

| Target | Required review and source owner | Executable coverage | Contract difference or remaining comparison |
| --- | --- | --- | --- |
| 20 — Übersicht | Named setup areas, current summaries/tasks, available navigation and explicit unavailable sections. [`overview.js`](../src/tenant-admin/overview.js), [`overview-model.js`](../src/tenant-admin/overview-model.js). | [`tenant-overview.spec.js`](../tests/e2e/tenant-overview.spec.js); Production CO-309 direct Administration navigation. | Review the target card hierarchy and role-specific task state. Summary counts must reflect current adapters; unavailable reads are not completed setup. |
| 21 — Organisation | Tenant-owned identity/presentation, locale/currency, managed mark and explicit save/cancel behavior. [`organization/index.js`](../src/tenant-admin/sections/organization/index.js), [`settings-shell.js`](../src/tenant-admin/settings-shell.js). | [`tenant-settings-production-composition.spec.js`](../tests/e2e/tenant-settings-production-composition.spec.js) CO-307 Stay/discard, failed/successful save and detached conflict cases; [`tenant-presentation.spec.js`](../tests/e2e/tenant-presentation.spec.js). | The proposed dirty-state dialog is a behavioral requirement, not only artwork: Stay/Escape retains edits and restores focus, explicit discard governs navigation, and authority loss invalidates the privileged surface. Managed branding is not an arbitrary URL upload contract. |
| 22 — Standorte und Räume | Site identity/address/time zone, room technical/provider facts and deliberately published guest values. [`locations/index.js`](../src/tenant-admin/sections/locations/index.js), [`guest-information-editor.js`](../src/tenant-admin/sections/locations/guest-information-editor.js). | Tenant settings composition REG-01/REG-02 ownership, API-02 public guest validation and H-035 publish/withdraw cases. | Preserve the distinction between Tenant-owned technical data, Manager-owned room business data and guest-public fields. A combined visual layout does not authorize mixed-ownership saves or rollback of Manager data. Proposed extra fields require an existing API contract. |
| 23 — Buchungsrichtlinien | Policy versions/effective times, readable duration units, named references, retained unknown references and safe conflict recovery. [`booking-policies/index.js`](../src/tenant-admin/sections/booking-policies/index.js), [`duration-editor.js`](../src/tenant-admin/sections/booking-policies/duration-editor.js), [`reference-selection.js`](../src/tenant-admin/sections/booking-policies/reference-selection.js). | [`policy-guidance.spec.js`](../tests/e2e/policy-guidance.spec.js); Tenant settings composition CO-306 duration/minutes cases. | Effective versions remain immutable; future versions are explicit. Display units must round-trip exact minutes. The proposed simplified view must not silently replace version history, erase unknown saved references or convert unavailable catalogue data to an empty policy. |
| 24 — Kostenverrechnung | Required allocation setting, searchable named cost-center entries/details, code/name/group/active fields and revision-bound complete saves. [`cost-allocation/index.js`](../src/tenant-admin/sections/cost-allocation/index.js), [`catalogue-editor-list.js`](../src/shared/catalogue-editor-list.js). | Tenant settings composition CO-306 owned-search snapshots and CO-299 duplicate-code focus; [`tenant-catalogue-drafts.spec.js`](../tests/e2e/tenant-catalogue-drafts.spec.js). | Compare search, details and action placement with the proposal. Search never narrows the persisted collection; duplicate-code errors identify the real invalid field. No balances, accounting integration or additional approval powers are inferred. |
| 25 — Kalender und Onboarding | Correct provider-specific presentation, candidate inventory/import, readiness, explicit lifecycle and recoverable failures. [`ONBOARDING-WIZARD.md`](ONBOARDING-WIZARD.md), [`onboarding-wizard.js`](../src/tenant-admin/onboarding-wizard.js), [`synthetic-calendar/index.js`](../src/tenant-admin/sections/synthetic-calendar/index.js). | [`onboarding-wizard-behavior.test.js`](../tests/onboarding-wizard-behavior.test.js), [`synthetic-onboarding.spec.js`](../tests/e2e/synthetic-onboarding.spec.js), [`fabrikam-scenario.js`](../tests/e2e-saas37/fabrikam-scenario.js). | Keep three contracts distinct: REAL seven-step Microsoft onboarding; ordinary server-backed Demo/Fabrikam using seven steps; protected synthetic calendar using four server checks. The four-check proposal does not replace the Microsoft flow, prove real provider consent or authorize synthetic fallback when classification is unknown. |
| 26 — Audit | Bounded filterable events, named actors where available, selection, pagination and deliberate technical details. [`audit/index.js`](../src/tenant-admin/sections/audit/index.js), [`audit/model.js`](../src/tenant-admin/sections/audit/model.js), [`tenant-audit-api.js`](../src/platform/tenant-audit-api.js). | [`tenant-audit-compact.spec.js`](../tests/e2e/tenant-audit-compact.spec.js), [`tenant-audit-api.test.js`](../tests/tenant-audit-api.test.js). | Preserve event/actor/target meaning, identifiers in the appropriate detail view and explicit integrity/load failures. The API does not supply a general before/after field diff; do not manufacture one to match a proposed detail panel. |
| 27 — Benutzer und Rollen | Authorized user list/search/filtering, selected details, server-derived lifecycle, direct roles and independent Microsoft group sources; conflict and stale-state recovery. [`users/index.js`](../src/tenant-admin/sections/users/index.js), [`users/model.js`](../src/tenant-admin/sections/users/model.js), [`tenant-user-operations-api.js`](../src/platform/tenant-user-operations-api.js). | [`tenant-role-administration.spec.js`](../tests/e2e/tenant-role-administration.spec.js), [`tenant-admin-operations.test.js`](../tests/tenant-admin-operations.test.js), [`tenant-admin-operations-composition.test.js`](../tests/tenant-admin-operations-composition.test.js). | The API exposes names, not a user email column. Effective roles must retain their direct/group provenance; removing a direct role cannot remove group authority. Current-server refresh, read-only stale-state handling and localized counts require candidate-specific verification when changed. Do not infer invitation or identity-provider powers from the target alone. |

## Acceptance record and completion criteria

Keep one traceable record per target in Jira, linked to the relevant work item
and implementation. A useful record includes:

1. The target reference and scope of comparison, with the exact frontend/API
   revisions and actual served identity when the check is hosted.
2. The scenario, role, language, browser, viewport and exercised states/actions.
3. Expected and observed behavior, a safely redacted screenshot or print artifact
   where useful, and the exact test run/artifact supporting automated claims.
4. Each contract or presentation difference, its explicit product disposition,
   remaining work and the person accepting the result.

An unreviewed target stays unreviewed. A source-level finding is not a browser
result; a passed browser fixture is not a live provider result; a live deployment
is not product acceptance. Keep previous failed checks and accepted limitations
as historical evidence rather than relabeling them after a later change.

Relevant implementation must still pass the repository's required quality,
dependency, security and browser gates. Preserve the permanent
[three-customer progression and two-cycle reset contract](SAAS-3.7-SCENARIO-ACCEPTANCE.md)
for Northwind, Contoso and Fabrikam in both supported engines against the exact
immutable counterpart. Seed-row presence or a single happy-path screenshot is
insufficient. Protected synthetic, ordinary Demo and REAL evidence remain
separate, including their onboarding and provider acceptance limits.

CO-320 can record product acceptance only after the required screen comparisons,
role-owned journeys, guest print, reports and onboarding scope have actual
evidence and the remaining differences have an explicit disposition. This
document supplies the repeatable review contract and does not close that work.

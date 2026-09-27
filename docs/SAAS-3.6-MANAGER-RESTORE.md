# SaaS 3.6 Manager presentation restore

This change implements the Conference Manager presentation work in #181 against the
inventory in `UI-RESTORE-PARITY.md`. The server API remains the authority for Tenant,
Principal, workflow, historical attribution, configuration ownership and persistence.

## Delivered surfaces

| Parity IDs | Behavior |
|---|---|
| MGR-01 | Four named tabs share a labelled tab panel. Arrow/Home/End keyboard navigation and the selected tab survive capability rerenders within the current application context. |
| MGR-02–MGR-03 | Action/today/seven-day/upcoming cards, ordered operational summaries, combined search/status/Site/quick filters, reset and visible result counts. Dates use each Request's Site IANA time zone. Search includes only server-projected requester display data. |
| MGR-04, MGR-08 | Requester display, immutable business details and an ordered history with localized operations/statuses and persisted actor/role-at-action display. Missing legacy attribution is labelled as not recorded. |
| MGR-05, MGR-07, MGR-13 | Confirmation and cancellation require a review dialog. Reject/request-change reasons have inline errors. Mutations are serialized per Request and stale rendered cards cannot start new mutations. Cancellation preserves the Request and no delete API is introduced. |
| MGR-06 | Pending changes expose persisted initiator display. Version-matching terminal changes (`applied`, `rejected` or `superseded`) expose separate persisted initiator/decider evidence where recorded and do not block a new proposal for a still-confirmed Request. Employee and Manager use the same fail-closed eligibility rule. This requires the v3 attribution envelope and latest-change lookup in API #187. |
| MGR-09 | Dedicated Site/date controls, retained list/timeline selection and date, bounded keyboard-reachable scrollers and direct entry into the operational Request. Timeline positions use actual elapsed time in the Site-local day, including 23/25-hour DST days. Overlapping bookings occupy separate visual lanes. |
| MGR-10 | Day/month/quarter/year controls request server reports for Site-local calendar boundaries. Results include booking/confirmed/participant/hour/Catering metrics, Room/Service/Catering package/item tables and factual operational insights. |
| MGR-11–MGR-12, MGR-14 | Existing Room business and Catalogue editors run inside Administration, preserving the independent Manager permission boundary and technical-provider exclusion. |

## Reporting semantics

The API report is selected by `startsAt >= fromInclusive && startsAt < toExclusive`.
The Site filter is applied to the server-scoped response. Participant totals, elapsed Room
hours and usage tables count confirmed bookings; the all-booking metric and outstanding
work insight include the other applicable statuses. A multi-day booking contributes its
full elapsed duration to the period containing its start. Persisted price snapshots supply
historical Room/Service/Catering display names, including inactive catalogue entries.

No available-hours denominator is supplied by the server contract, so the UI does not invent
an occupancy percentage or reuse the historical hardcoded 06:00–22:00 assumption. Cost and
cost-center reporting remain outside the approved customer role scope.

## Ownership and validation

`server-cockpit-model.js` owns independently testable canonical projection calculations.
`server-analytics-view.js` owns Manager planning/report controls and presentation.
`production-application.js` retains workflow orchestration; `workspace-application.js`
composes the operational application with the approved business editors. Translation additions
use the central `manager.restore.*` namespace and styling remains in `manager-layout.css`.

Added tests cover combined filters, retired Room context, missing attribution, Site DST,
invalid periods, persisted catalogue names, report status/count rules and terminal-change
proposal eligibility. Browser tests cover keyboard tabs, embedded settings, no-result recovery,
timeline navigation/history, explicit confirmation/cancellation, period changes and reflow in
both configured engines.

Node/static gates and dependency audit are run locally. The local Playwright launch is blocked
by unavailable Chromium/WebKit executables; the configured engines could not be downloaded in
this environment. Passing GitHub browser checks and the cross-role/shared-state acceptance
gate in #182 remain mandatory. This document is not a claim of formal WCAG conformance,
deployment acceptance, or complete milestone closure.

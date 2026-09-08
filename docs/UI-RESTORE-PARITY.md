# SaaS 3.6 Employee and Conference Manager UI Restore Contract

## Status and authority

This document is the source-controlled parity contract for GitHub issue #179. It records the
approved UI restoration scope before #180 and #181 change the active application. Issue #182 is
the mandatory evidence gate for this contract.

The comparison baseline is the parent of SaaS 3.5 commit
`07f2896d56e6f66a9f8daf96457ab12c763adf80` (`07f2896^`). That historical tree is a behavioral,
information-architecture and visual reference only. Current `main`, the current API contracts,
server-issued Principal, PostgreSQL persistence, Tenant isolation, session/CSRF controls, the
modular capability boundaries and `docs/ROLE-MODEL.md` remain authoritative.

The restoration therefore means:

- restore the complete Employee and Conference Manager presentation and information architecture;
- port presentation behavior to current server-backed application contracts;
- keep one active Employee renderer and one active Manager renderer after migration;
- never reconnect historical LocalStorage business authority, Demo identity authority or
  client-side authorization;
- fail visibly when an API/session/projection is unavailable; never select a fixture or browser
  business-state fallback;
- treat Tenant Admin and dual-role presentation as regression-only scope, apart from shared shell
  and permission-aware navigation.

## Classification

| Disposition | Meaning |
|---|---|
| `RESTORE_REQUIRED` | Approved baseline presentation or interaction is missing from the active server-backed renderer and must be restored by #180 or #181. |
| `RETAIN_AND_ENHANCE` | A current server-backed capability exists, but its presentation must be brought back to the approved baseline. |
| `RETAIN_CURRENT` | The current implementation already provides the required behavior and is retained with regression coverage. |
| `SUPERSEDED_BY_SECURITY` | Historical behavior conflicts with a current trust boundary and must not return; an equivalent server-authoritative experience is required where applicable. |
| `REGRESSION_ONLY` | No visual restoration is planned, but role, navigation and data-isolation behavior must remain correct. |

No `RESTORE_REQUIRED` or `RETAIN_AND_ENHANCE` item may be silently dropped. A changed disposition
requires an explicit product/security decision in the owning issue and a corresponding update to
this contract.

## Current runtime finding

The current Composition Root creates `createServerEmployeeApplication()` and
`createServerManagerApplication()`. The public Employee and Manager facades currently route those
names to `production-application.js` and `workspace-application.js`. The older rich presentation
modules remain in the tree but are not part of the active runtime graph.

This produces a split state:

- current server-backed persistence, workflow, Room availability, history, booking-change and
  Manager business-settings contracts are authoritative and reusable;
- `src/employee/application.js`, the Employee enhancement modules, `src/manager/application.js`
  and the Manager enhancement/parity modules contain reference presentation behavior but depend on
  historical browser-shaped models and cannot simply be re-exported;
- the CSS and central DE/EN messages still contain much of the approved visual language;
- the SaaS 3.5 boundary gate lists the removed UI E2E specifications as retired, so equivalent
  server-backed contract tests must replace that implementation-coupled prohibition in #182;
- `docs/ARCHITECTURE.md` describes the complete Employee/Manager behavior as if it were active,
  while the active exported renderer is the simplified server UI. That documentation is corrected
  alongside this contract and must be finalized again by #169 after implementation.

## Employee parity matrix

| ID | Surface / intent | Historical presentation contract | Current server contract / authority | Current finding | Required evidence |
|---|---|---|---|---|---|
| `EMP-01` | Guided Request creation | One active panel in a six-step wizard with desktop stepper, mobile progress, Back/Next and direct backward editing | `loadCatalog`, `checkRoomAvailability`, `createRequest`; server validates final request | `RESTORE_REQUIRED`: all six basic fieldsets are currently visible together | Chromium and WebKit/iPhone sequential navigation, validation and focus tests |
| `EMP-02` | Schedule and participants | Title, location/date/time and internal/external participants ordered for comprehension; participant total updates consistently | Server catalog/site time zone, bounded participant fields and final API validation | `RETAIN_AND_ENHANCE`: fields exist; derived summary currently starts at zero despite the default internal participant | Unit/UI assertions for derived totals, time-zone conversion, invalid/ambiguous time and mobile order |
| `EMP-03` | Room selection | Visual Room cards, capacity/price/equipment, unavailable reasons, preview and floorplan dialog | Policy-filtered `roomEditorOptions`, server availability check and authoritative Site time zone; #180 must extend the minimized application Catalogue projection with approved Room equipment and floorplan/media asset references before rendering them | `RESTORE_REQUIRED`: active UI is a bare Room select, and the current Room projection omits equipment and assets | Card selection, capacity/no-room recovery, conflict, preview/floorplan, keyboard, projection rejection and safe asset tests |
| `EMP-04` | Services and Equipment | Selectable cards with applicability, visible price basis and retained selection | Server Catalogue projection filtered by selected Room/Site and booking policy; Room equipment depends on the minimized #180 projection extension defined by `EMP-03` | `RETAIN_AND_ENHANCE`: checkbox controls exist but approved card hierarchy and guidance are missing | Applicability, selection persistence, price-basis, empty/error, minimized equipment projection and DE/EN tests |
| `EMP-05` | Catering | Package and individual-item modes, variants, quantities, participant count, dietary requirements and clear selection state | Server Catalogue projection plus bounded schema-v2 catering draft | `RETAIN_AND_ENHANCE`: core fields exist; package grouping, visuals and interaction hierarchy are missing | Package/item/variant/quantity bounds, Room applicability, image safety and responsive card tests |
| `EMP-06` | Cost allocation | Cost guidance, one or more allocations, exact 100% validation and understandable price composition | Server Cost Centre/policy projection and basis-point allocation payload | `RETAIN_AND_ENHANCE`: allocation inputs exist; heading currently exposes raw key `settings.catalogue.title` and guidance is reduced | Raw-key detection, exact allocation, localized currency/number and validation focus tests |
| `EMP-07` | Review and edit | Dedicated final review with section cards and direct edit links to earlier steps | Current normalized server request draft and final transactional availability check | `RESTORE_REQUIRED`: there is no genuine final review step | Complete review projection, direct edit, changed-window recheck and submit-disabled tests |
| `EMP-08` | Submit and completion | Persistent, understandable success state and transition to the created Request | `createRequest` followed by server-backed list refresh | `RETAIN_AND_ENHANCE`: submit exists but approved completion presentation is missing | Duplicate/stale/error prevention, focus/status announcement and shared-state verification |
| `EMP-09` | Draft save/restore | Continue-draft action and restoration into the correct wizard step/state | `createServerDraftStore` is Tenant/User-scoped untrusted session draft; server remains business authority | `RETAIN_AND_ENHANCE`: draft data exists but not in the approved guided interaction | Tenant/User isolation, malformed/expired draft, clear-after-submit and lock tests |
| `EMP-10` | Own Request list/detail | Filtered own cards with status, immutable details and clear actions | `listRequests` returns server-scoped projection; frontend must not derive Tenant/User scope | `RETAIN_AND_ENHANCE`: cards/details/actions exist with reduced toolbar/information hierarchy | Own/non-owner/cross-Tenant negatives, loading/empty/error and current-Room-history tests |
| `EMP-11` | Calendar | List/calendar switch and navigable monthly calendar for own Requests | Same server-scoped `listRequests` projection; locale/time zone presentation only in browser | `RESTORE_REQUIRED`: calendar is unreachable in the active renderer | Month navigation, event detail, time-zone/date localization, keyboard and mobile tests |
| `EMP-12` | History | Accessible Request timeline with localized operation/status data | `loadRequestHistory` server audit/history projection | `RETAIN_AND_ENHANCE`: history dialog exists; timeline hierarchy is reduced | Ordered/localized history, empty/error, focus return and authorization tests |
| `EMP-13` | Change/resubmit/cancel/repeat | Supported lifecycle actions from own Request cards with explicit dialogs and preserved draft content | `proposeBookingChange`, `resubmitRequest`, `transitionRequest`; no physical delete | `RETAIN_CURRENT` for server operations; restore approved presentation and recovery details | State matrix, stale version, confirmed-change, cancel-not-delete and repeat-across-DST tests |
| `EMP-14` | Guest Information | Rich guest dialog with schedule, route/arrival, building, accessibility/contact and safe Wi-Fi policy | Confirmed Requests only; #180 must extend the minimized `loadRequestRoomContext` projection with approved address, arrival, accessibility, contact, public route and non-secret Wi-Fi-policy presentation fields | `RETAIN_AND_ENHANCE`: basic detached print data exists, rich in-app guest view is missing, and the current Room/Site envelope cannot supply the approved context | Confirmed-only visibility, exact projection rejection, safe HTTPS route, focus return and missing-data tests |
| `EMP-15` | Print | Styled detached guest/welcome document with meaningful print action and no opener relationship | Server Request plus the minimized #180 Room/Site context extension defined by `EMP-14`; no internal identifiers, secrets or tokens | `RETAIN_AND_ENHANCE`: a minimal print window exists; approved layout/route context is missing | Strict CSP, `opener === null`, no token/internal leakage, print CSS and popup-blocked behavior |

## Conference Manager parity matrix

| ID | Surface / intent | Historical presentation contract | Current server contract / authority | Current finding | Required evidence |
|---|---|---|---|---|---|
| `MGR-01` | Workspace navigation | Four semantic tabs: Bookings, Room planning, Reports and Administration | Trusted Manager permission controls capability composition | `RESTORE_REQUIRED`: active operational UI is one card/list surface plus detached business-settings entry | Semantic tab identity, active state, focus and direct rerender tests |
| `MGR-02` | Operational overview | KPI cards, action/upcoming summaries and actionable quick filters | Server-scoped `listRequests`; `managerOverview` remains reusable presentation model | `RESTORE_REQUIRED` | KPI/filter calculation, empty states, quick-filter semantics and responsive tests |
| `MGR-03` | Search and filters | Search plus status, location and quick filters with visible active-filter state | Filtering is presentation over the server-authorized Tenant projection | `RESTORE_REQUIRED` | Combined filters, reset, no-result recovery, retained state and keyboard tests |
| `MGR-04` | Request cards/details | Complete Request/business projection, status/priority, requester context and timeline | `listRequests`, `loadRequestRoomContext`, shared immutable details renderer | `RETAIN_AND_ENHANCE`: core data exists but hierarchy and integrated timeline are reduced | Same-Tenant visibility, cross-Tenant concealment, safe rendering and responsive tests |
| `MGR-05` | Review decisions | Start review, confirm, reject and request change with reason/confirmation dialogs | `transitionRequest` and server workflow/audit validation | `RETAIN_CURRENT` for server operations; restore approved review/dialog presentation | Status/action matrix, reason requirement, focus return, CSRF/stale/negative tests |
| `MGR-06` | Confirmed changes and self-approval | Propose/decide confirmed changes; self-approval retains distinct initiator/decider evidence | `proposeBookingChange`, `loadBookingChange`, `decideBookingChange`; #181 must add minimized server-owned initiator/decider display attribution because the current booking-change envelope contains none | `RETAIN_CURRENT` for mutation semantics; the presentation contract requires a server projection extension before it can surface audit meaning | Initiator/decider, exact projection rejection, own proposal, conflict/rejection and cross-Tenant tests |
| `MGR-07` | Change/cancel another User's Request | Same-Tenant, state-bound Manager action; cancellation retains history | Server workflow and permission enforcement; no DELETE contract | `RETAIN_CURRENT` | Same-Tenant positives, forbidden state, Tenant Admin-only denial, cross-Tenant BOLA/IDOR and no-delete tests |
| `MGR-08` | Timeline/history | Timeline visible from operational card/review context | `loadRequestHistory`; #181 must extend its minimized server projection with approved actor display attribution because current entries contain no actor field | `RETAIN_AND_ENHANCE`: history is dialog-only and disconnected from cockpit hierarchy; actor semantics are not currently projectable | Ordering, localization, exact attribution projection, empty/error and focus tests |
| `MGR-09` | Room planning | Dedicated tab, date/location controls and timeline/list views with booking detail | `roomPlanProjection`, Site IANA time zones and server Request projection | `RETAIN_AND_ENHANCE`: current minimal table is modal-only with no timeline/location view | Multi-day/DST, site filter, timeline/list, overlap, mobile cards and keyboard tests |
| `MGR-10` | Reports | Dedicated period/reference controls, KPIs, Room/Service/Catering tables and operational insights | `loadRequestReport` supplies bounded server projection; `buildReportModel` remains reusable | `RESTORE_REQUIRED`: active report output is a toast summary only | Day/month/quarter/year, localized range/KPIs, empty data, Room/Service/Catering tables and insight tests |
| `MGR-11` | Room business administration | Approved local presentation fields, capacity/business metadata, accessibility/assets and Room price | `locations.load/saveLocations`; server reclassifies fields and preserves provider identity | `RETAIN_AND_ENHANCE`: #166 editor exists but is outside the four-tab cockpit and lacks historical hierarchy | Field ownership, immutable provider IDs, revision conflict/history, safe asset and authorization tests |
| `MGR-12` | Catalogue administration | Services, Equipment, Catering items/packages/variants, applicability, ordering, activation and prices | `catalogue.load/saveCatalogue`; server validates exact aggregate and Manager permission | `RETAIN_AND_ENHANCE`: #166 editor exists but is detached from the approved Administration tab | Collection bounds, price/currency, applicability, deactivation/reference and revision tests |
| `MGR-13` | Physical deletion | No customer-facing physical Request delete action | No frontend DELETE contract; cancellation/status/history remain authoritative | `SUPERSEDED_BY_SECURITY`: any historical or future destructive affordance is prohibited | Static/runtime absence plus backend method/route negative tests |
| `MGR-14` | Technical provider administration | Must not appear in Conference Manager workspace | Tenant Admin owns discovery/import/mapping/sync/integration | `SUPERSEDED_BY_SECURITY` | Permission/navigation absence and direct-route/API denial tests |

## Regression-only matrix

| ID | Scope | Required invariant | Disposition | Required evidence |
|---|---|---|---|---|
| `REG-01` | Tenant Admin | Existing organization, policy, cost allocation, User/role, audit and technical provider surfaces remain available only with their trusted permissions | `REGRESSION_ONLY` | Navigation and direct-route allow/deny matrix |
| `REG-02` | Tenant Admin | Tenant Admin-only does not receive Manager Requests, reports, Room business fields, Catalogue or Room price | `REGRESSION_ONLY` | UI absence plus API authorization negatives |
| `REG-03` | Dual role | Exact independent permission union exposes Employee, Manager and Tenant Admin capabilities without merging their ownership rules | `REGRESSION_ONLY` | Navigation, direct routes, role changes and server permission matrix |
| `REG-04` | Tenant/persona switch | Switching context clears stale view state and cannot preserve data or actions from the prior Tenant/Principal | `REGRESSION_ONLY` | Independent browser contexts, direct-route, back/forward and cross-Tenant checks |
| `REG-05` | Inactivity lock | Lock clears sensitive surfaces and unlock re-resolves server authority on every restored view | `REGRESSION_ONLY` | Wizard, list, calendar, cockpit, report, dialog, cross-tab and BFCache tests |

## Cross-cutting presentation states

Every restored surface must deliberately support the applicable states below. A success-path-only
port does not satisfy parity.

| State | Contract |
|---|---|
| Loading | Mark the active region busy, retain meaningful page context and prevent duplicate mutations. |
| Empty | Explain the absence of data and provide an authorized recovery action where one exists. |
| Success | Announce the outcome, preserve a stable completion state and restore focus deliberately. |
| Validation | Use localized complete messages, `aria-invalid`/descriptions and focus the first invalid control. |
| Conflict/stale | Preserve user input where safe, explain the server conflict and require an explicit reload/reapply path. |
| Unauthorized | Fail closed without revealing foreign Tenant/object existence. |
| API/session unavailable | Remove stale authority-bearing UI and never fall back to fixtures or browser business state. |
| Locked | Remove sensitive content; local activity cannot unlock or mint authority. |

## Migration ownership and sequence

1. **#179 — contract:** this matrix, architecture correction and executable inventory guard.
2. **#180 — Employee:** port the presentation into the server-backed Employee capability. Reuse
   server draft/editor/projection contracts and approved DOM/CSS/i18n patterns; do not reconnect the
   historical application repository.
3. **#181 — Manager:** port cockpit/planning/report presentation into the server-backed Manager
   workspace and integrate #166 business settings behind the approved fourth tab.
4. **#182 — gate and cleanup:** replace retired implementation-name checks with observable
   server-backed parity coverage, run the complete role/security/browser matrix, then remove
   superseded/unreachable UI paths and dead selectors/imports.
5. **#169/#170 — documentation and release:** document exact merged behavior and accept SaaS 3.6
   only after #182 passes.

Employee and Manager work may proceed in parallel after this contract is merged. #182 starts only
after both capability restores are integrated.

## Target active ownership

| Concern | Owner after restore | Approved dependency |
|---|---|---|
| Employee wizard, own list/calendar/history and Guest/print | Employee | Server persistence plus Shared/Core presentation contracts |
| Manager cockpit, workflow presentation, planning and reports | Manager | Server persistence plus Manager domain/presentation models |
| Room business and Catalogue editor | Manager | Injected Location/Catalogue APIs; server reclassification |
| Shared immutable Request details and confirmed-change editor | Shared | Capability-neutral server projections only |
| Session, Principal, Tenant and permission projection | Platform/trusted backend | Never derived by Employee or Manager DOM state |
| Tenant technical/configuration administration | Tenant Admin | Independent injected APIs and permissions |

## Obsolete-path disposition

The following paths require an explicit decision during #180-#182 rather than indefinite parallel
retention:

- `src/employee/application.js` and Employee post-render enhancement modules: port reusable
  presentation behavior to the canonical server Employee renderer, then remove or reduce the
  historical browser-shaped path when no active consumer remains;
- `src/manager/application.js` and Manager parity/polish modules: port reusable cockpit, planning
  and reporting behavior to the canonical server Manager workspace, then remove the obsolete path;
- `src/employee/production-application.js` and `src/manager/production-application.js`: evolve or
  replace behind the public facades, but do not leave both simplified and restored active renderers;
- `scripts/check-customer-demo-boundaries.mjs`: stop treating removed UI test filenames as the
  security boundary; enforce prohibited LocalStorage/session/fixture authority and parallel active
  runtime behavior instead;
- deleted pre-SaaS-3.5 E2E specifications: restore equivalent observable contracts with
  server-backed fixtures. Historical LocalStorage setup is not reusable authority evidence.

Removal happens only after the restored observable behavior and current security contracts are
covered. Git history remains the audit record.

## Definition of done for #179

- IDs `EMP-01` through `EMP-15`, `MGR-01` through `MGR-14` and `REG-01` through `REG-05` have an
  explicit disposition, current authority and evidence requirement.
- #180, #181 and #182 can link every implementation/test change to a contract ID.
- The architecture documentation no longer claims the historical rich renderers are currently
  active.
- An automated repository test prevents accidental removal or weakening of this inventory.
- No application runtime, persistence or authorization behavior is changed by #179.

# Catering Admin setup

Tracking: #232. API setup depends on conference-manager-api#208/#209/#210. This source component is
not a deployment or SaaS4 acceptance claim. Credentials, verified provider health, ordering/delivery,
Manager decisions and external supplier qualification remain separate work.

The native-ESM Tenant Admin section `catering` owns technical connection presentation only. Platform
owns bounded same-origin API validation and optional discovery; the Composition Root injects the
adapter through the existing server-settings facade. Shared owns the stable technical capability,
mode and initial-mode wire values. The section does not import Platform, Employee or Manager.
The architecture allowlist explicitly registers only this new section; unknown sections and private
cross-section/Platform/Manager imports remain denied and regression-tested.

The central `catering.configuration` flag defaults OFF and the global default remains OFF. A scoped
presentation resolver can enable it only after the authenticated Admin discovery returns a valid
closed server page. Discovery never runs for Demo, non-Admin or missing integration permission.
Absent/disabled/malformed/unavailable endpoints hide this optional section without a Demo fallback.
Discovery is abortable and bounded; late results cannot change global rollout. HTTP401/403 propagate
through existing authority invalidation. Client flags, navigation or provider selection grant no
server authority; every read/write still requires the actual backend role/Tenant/session/CSRF/object
and transaction fences.

The section lists at most20 existing connections per page and replaces pages instead of accumulating
forms. Existing design-system cards, fieldsets, labels, form grids, buttons and live feedback are
reused; no CSS, image, dependency, browser-storage key or alternative i18n system is introduced.
German and English strings live in the canonical Admin catalogue and revisions use locale number
formatting. Provider/connection headings use localized labels and a bounded distinguishing internal
reference, never private provider references, credentials or URLs.

Each connection independently edits its initial-order mode and six technical modes. Mode options
can only retain source support or disable it. Changes/cancellations retain their separate Manager
approval requirement. Saved configuration is explicitly distinguished from verified availability
and delivery readiness. Tenant Admin alone gains no business approval and Manager alone sees no
technical connection administration.

Setup generates a random command UUID in memory. An explicit retry of unchanged input reuses that
UUID after an unavailable response; changed input creates a new command. There is no automatic
mutation retry. Server-generated connection identity and the PostgreSQL receipt own replay safety.
Forms suppress duplicate in-flight submits, retain failed input, announce errors, restore action
focus and ignore late results after navigation/session invalidation. A stale write requires explicit
reload; it never silently replaces the expected revision. Successful saves/reloads/page changes
refresh the authoritative list and focus the heading only when doing so will not interrupt a new
interaction. Navigation does not persist unsaved configuration or command material in browser storage.

Transport positively validates closed schema/revision/UUID/provider/mode/page shapes and bounded,
ordered same-provider projections. Unknown/private fields and bad acknowledgements fail closed.
The UI currently admits only the source-defined manual_catering provider; no unqualified API adapter
is silently substituted. Browser fixtures are synthetic server projections and do not prove real
provider or PostgreSQL behavior. Actual DB, session/CSRF HTTP and permanent three-customer/reset
acceptance remain independently required in the API and paired browser gates.

The read-only [operation status](CATERING-OPERATIONAL-HEALTH.md) adds bounded
stored-work evidence per connection. It does not establish verified provider
health, credentials or delivery readiness and never grants business approval.

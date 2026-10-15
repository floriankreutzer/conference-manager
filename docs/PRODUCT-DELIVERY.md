# Private Product & Delivery view

The independent Operations view presents Product Outcomes, structured Pilot Feedback
and four weekly DORA windows for application/API/website. Provider/FinOps and technical
availability remain separate. Product recovery failure rate uses confirmed completed/failed
recovery outcomes; it is independent from deployment change failure rate and stays
unknown for missing coverage or an empty denominator. It uses the trusted API's
[source and calculation contract](https://github.com/floriankreutzer/conference-manager-api/blob/main/docs/PRODUCT-DELIVERY.md).

The browser only validates/renders the closed projection; it does not calculate
business outcomes, accept arbitrary events, infer missing clocks or provide authority.
The same-origin Demo adapter makes a fixed bounded GET. Customer roles and presentation
flags do not grant private access. Production composition rejects this Demo adapter.
No browser persistence, tracking service, session replay, free-text feedback or new
runtime dependency is introduced.

platform.product-delivery defaults OFF in the canonical registry; the Operations Demo
override enables presentation. Deployment manifests include the exact reachable modules
and keep the Customer, Production adapter and Demo adapter boundaries separate.

Unknowns are explicit; known zero requires a complete applicable source. Source mode,
observation/window, freshness, fingerprint and unresolved recoveries remain visible.
Refresh reloads the saved operator aggregate, not live provider/source collection.
German/English text and number/date formatting use the existing central i18n layer;
UTC windows, semantic definition lists, native keyboard details and the existing design
tokens/layout preserve mobile reflow. Supported-source and collection limitations are
part of the API contract; no Demo result is a Production DORA claim.

Controlled browser fixtures cover unknown/known snapshots, safe failures, language and
keyboard changes, 200% text-size reflow and screenshots in both configured engines.
They are synthetic test data, not real Pilot evidence. Native full browser and permanent
three-customer/two-reset CI plus the exact API counterpart are required before acceptance.

The Product/Operations owner reviews context, source semantics and coverage whenever
major workflows or target roles change. Update the canonical calculation/source
contract and its negative tests before enabling newly known values. Protected Pilot
evidence stays in the authorized operator workflow; it is not copied into this view.

The shared browser CI uses an immutable API candidate; acceptance requires that
candidate's full gates/review and independently equal merge tree. This paired API
reference is distinct from the later hosted API commit, whose only follow-up may
align the embedded/CI frontend pin. That final runtime/frontend pair must independently
pass API CI and hosted deployment metadata/readiness checks. The CI PostgreSQL image
is pinned to the same independently verified 18.6-alpine OCI digest as the API suite,
rather than a moving tag; no database-version, test or quota change is intended.

Product cache entries are revalidated at the next server-defined freshness, UTC-window
or retention boundary. Timers stay below browser overflow; suspended tabs recheck
on focus/visibility/pageshow and revisits test cache age. A stale/expired entry is
evicted before reload; failures do not keep old data visible. Request-flight time is
included conservatively, wall and monotonic elapsed time are both checked, and
replacement/role reset/disposal cancel obsolete callbacks. This only reloads the
private saved aggregate; it is not provider collection. The paired CI also verifies
the actual API-generated exact-expiry wire fixture before browser acceptance.

## Optional daily connector feed

Both Demo adapters now prefer the fixed `demo/live-metrics` GET. Its API-owned
[closed daily source and storage contract](https://github.com/floriankreutzer/conference-manager-api/blob/main/docs/DAILY-LIVE-METRICS.md)
keeps collection server-side behind the owner perimeter. No browser provider tokens,
new runtime dependency or persistence is introduced. The old endpoint remains an
explicit unavailable-feed rollout fallback, while malformed live success fails closed.
The new neutral measurement contract/renderer is included in each reachable manifest;
only the Demo manifest contains the live HTTP adapter. Immutable paired CI verifies
its actual API-generated fixture and fixed measurement dimensions.

Provider rows distinguish last hourly sample, query window, provider resets and
workflow counts from invoice totals. Product rows show retained Demo stock including
seed and today's retained updates/revisions/diagnostics; they do not establish Pilot
outcomes, complete history across resets or audit verification. Unknowns remain unknown.
Each row displays genuine source observation/period/sample clocks. Daily reports use
24-hour stale and 30-day retention limits; existing view clocks remain authoritative.
Refresh reads the latest collected report, not provider APIs. Deployment and an actually
executed scheduled collection require separate operational evidence.

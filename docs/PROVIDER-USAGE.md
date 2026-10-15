# Provider snapshot presentation

The canonical private source/access contract is owned by the API repository:
[Private Operations provider usage](https://github.com/floriankreutzer/conference-manager-api/blob/main/docs/DEMO-PROVIDER-USAGE.md).
This document describes only browser presentation. Ref #263.

The fixed same-origin Demo adapter returns a stored operator snapshot. The browser
does not collect provider usage, calculate business amounts, send warnings, establish
billing totals or enforce a spending cap. Render/GitHub billing and total cost remain
unknown under the current source contract. Separately evidenced Resend deliveries do
not configure this view's automatic mail transport.

The wire normalizer verifies that freshness agrees with the server's observation,
evaluation and accounting-window clocks. The Provider contract is fresh through exactly
24 hours and stale strictly afterwards, or at the accounting-window end. Product's
separate 24-hour/UTC/30-day policy is unchanged.

Both views reuse a bounded observed-resource clock with independent policy functions.
Request-flight time counts conservatively; wall and monotonic elapsed time prevent
ordinary clock rollback or suspended tabs from extending freshness. Daily timer bounds,
resource identity checks and disposal prevent overflow and obsolete callbacks.

Provider expiry only degrades presentation to stale. It preserves the original wire
observation/evaluation, amounts and unknowns; it never promotes stale data to fresh or
fetches new source data. An inactive view is not repainted. Revisit/focus/visibility/
pageshow rechecks the clock, and a visible expiry safely hands detached keyboard focus
to the persistent heading. Manual refresh reads the saved server projection and may
receive a newer extract separately installed by an operator. Failed refreshes do not
keep the old report visible. Role/reset/disposal remove retained private state.

The Provider report remains visible with its stale label until refresh or disposal;
saved configuration/export custody remains an operator obligation. No new retention
deletion, provider credential, browser storage, email transport or automatic collector
is introduced. Synthetic fresh/refreshed browser fixtures are compared with the actual
immutable API loader before shared acceptance. Unit and browser clock cases cover
freshness/window boundaries, request flight, obsolete callbacks, navigation and focus.

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

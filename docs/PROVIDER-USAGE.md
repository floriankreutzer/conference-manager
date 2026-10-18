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

The Provider clock degrades expired observations without changing their original wire
times, amounts or unknowns. Returning to either insights view, window focus, visible
visibility change and pageshow recheck the clocks and reread the saved projection when
at least five minutes have elapsed since the last completed attempt. This includes a
still-fresh report, so a newly collected daily extract can be discovered before the old
one expires. Hidden views do not fetch. A visible expiry can schedule one delayed read
to respect that minimum interval; an already-stale response does not start a loop.
There is no periodic polling or browser-side provider collection. Concurrent triggers
share one in-flight read, and failed attempts retain the same five-minute backoff.

Manual refresh can read the saved projection immediately. Failed refreshes do not keep
the old report visible. The displayed last-loaded time records actual successful request
completion, separately from source observation/evaluation. Selected thematic tabs survive
refresh and language changes; detached tab focus is restored if the user has not moved
elsewhere. Role/reset/disposal remove retained private data, timers and read history.

The Provider report remains visible with its stale label until refresh or disposal;
saved configuration/export custody remains an operator obligation. No new retention
deletion, provider credential, browser storage, email transport or automatic collector
is introduced. Synthetic fresh/refreshed browser fixtures are compared with the actual
immutable API loader before shared acceptance. Unit and browser clock cases cover
freshness/window boundaries, request flight, obsolete callbacks, navigation and focus.

## Optional daily connector feed

The Provider adapter prefers the fixed `demo/live-metrics` GET. Product reads that source
independently of its runtime Product projection. The API-owned
[closed daily source and storage contract](https://github.com/floriankreutzer/conference-manager-api/blob/main/docs/DAILY-LIVE-METRICS.md)
keeps collection server-side behind the owner perimeter. No browser provider tokens,
new runtime dependency or persistence is introduced. The old endpoint remains an
explicit unavailable-feed rollout fallback. Only allowlisted unavailable HTTP responses
and bounded abort/timeout errors permit it; authority failures, invalid JSON, unexpected
content types, oversized responses, unknown errors and malformed live success fail closed.
The new neutral measurement contract/renderer is included in each reachable manifest;
only the Demo manifest contains the live HTTP adapter. Immutable paired CI verifies
its actual API-generated fixture and fixed measurement dimensions.

Provider rows distinguish the last hourly bandwidth value, latest memory sample, query window, provider resets and
workflow counts from invoice totals. Product rows show retained Demo stock including
seed and retained updates/revisions/diagnostics on the collection day; they do not establish Pilot
outcomes, complete history across resets or audit verification. Unknowns remain unknown.
Each row displays genuine source observation/period/sample clocks. Daily reports use
24-hour stale and 30-day retention limits. The Product cache independently bounds the
daily envelope, runtime Product, stored product report and separate operator sources: an older child report
cannot extend the fresh daily envelope past its own 24-hour limit. A stale envelope can
retain its explicitly stale state up to its own 30-day boundary; rereading does not renew
source observation times.
Refresh reads the latest collected report, not provider APIs. Deployment and an actually
executed scheduled collection require separate operational evidence.

## Thematic presentation

The owner-selected structure uses a compact overview and accessible thematic tabs:

- Providers: Overview, Usage & allowances, Data sources. The overview compares Neon,
  Render, Resend and GitHub in four equal cards at wide desktop widths, two at medium
  widths and one on a narrow screen. Cards retain different units and reporting windows.
- Product: Overview, Usage, Delivery, Feedback. Daily Demo inventory stays separate from
  the runtime Product projection, stored delivery report and independently confirmed operator facts. A separately
  connected feedback register is identified as its own source, even when the main product
  report has no configured feedback source.

Source labels distinguish the daily report, runtime Product, manually confirmed facts,
feedback register and stored fallback. Unavailable daily reads show a short fallback
notice with a bounded reason in a native disclosure. A fresh source is never described
as stale merely because another source is old; incomplete metrics remain a separate
coverage state. RAM uses its actual latest measurement time, not a claimed hourly value.

Missing values are briefly visible; causes, source timestamps, digests and methodology
are in native disclosures. Null is never rendered as measured zero. Provider figures use
the existing Neon reference meter and only same-observation, same-window Resend allowance
pairs. No historical provider series is invented from a single extract. Delivery charts
compare exactly four supplied weekly buckets of one selected metric; numeric table values
remain available, missing values have no meter and the chart scale is not a target.

The common tab presentation owns only button/panel state, roving keyboard focus and
Arrow/Home/End behavior. View selection belongs to the Platform application. All messages
remain in the central DE/EN catalog, with locale-aware values and the existing design
tokens. These source changes do not by themselves establish deployed or browser acceptance.

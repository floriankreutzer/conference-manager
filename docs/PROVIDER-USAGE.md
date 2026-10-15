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

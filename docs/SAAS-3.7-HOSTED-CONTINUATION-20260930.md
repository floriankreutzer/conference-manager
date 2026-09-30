# SaaS 3.7 hosted acceptance continuation — 2026-09-30

## Binding state

Continue frontend #215/#212 and PR #224 from `6c652db79e84a03fd8793402e3d1b48bcbde6a5c`, without reopening completed product or architecture decisions. The three customer scenarios, their real task/onboarding gaps, role/tenant separation and two complete reset cycles remain as documented in [the scenario acceptance contract](SAAS-3.7-SCENARIO-ACCEPTANCE.md).

Both existing Render Demo services were verified live on API `8e4dedd1a676a2dab26bc4ec812876eac98fc282` with application frontend `c1fee5e2c4f1d472174d194697dd635a5a9b0aef`. Customer deployment: `dep-dau33qjncjis73aiji80`; Platform deployment: `dep-dau33qjncjis73aiji6g`. This corrective batch changes only tests, test configuration and documentation. It does not change those applications or require a new service/deployment.

Seed: `saas-3.7-three-demo-customers-v1`. Canonical checksum: `7e22005f1e9689fbea4ccfc75084f5f3d224fe10e60a6af23c1cb600f2b70014`.

## Evidence inspected before this correction

The previous candidate's [CI run 36680668894](https://github.com/floriankreutzer/conference-manager/actions/runs/36680668894), [ZAP run 36680669146](https://github.com/floriankreutzer/conference-manager/actions/runs/36680669146), Dependency Review and Secret Scan succeeded. Downloaded isolated scenario artifact `11082445793` (SHA-256 `45dd1e0566b2830083ed1b16c2549965a6637f50a0b04dd610d3bfbb94eaccf2`) contains two successful browser results, no flaky results, and both complete mutation/reset cycles for each browser. Each cycle records ten Northwind rooms, twenty Northwind seed requests, seven completed Contoso tasks, two imported Fabrikam rooms, restoration of all three customers and the canonical checksum. That evidence is isolated PostgreSQL/browser evidence, not hosted acceptance of this new candidate.

[Hosted run 36680668877](https://github.com/floriankreutzer/conference-manager/actions/runs/36680668877) failed twice on the unchanged candidate:

- Attempt 1: Chromium passed. WebKit reached the existing shared-role journey's `Prüfung starten` control. The pointer action completed, but no matching transition POST followed. Its trace records moving/out-of-viewport geometry during scrolling; document scroll position also changed between action and after snapshots. A pointer/layout race is a hypothesis, not a proven application defect. The pending response waiter then consumed the remaining 180-second overall test budget.
- Attempt 2: Chromium passed in 132.8 seconds. WebKit progressed past that transition, through resubmission, cancellation and history verification, then exhausted the same overall budget at `platformPage.reload()`. The trace records cumulative asset/session/navigation latency, including individual JavaScript requests of about 11.7 and 17 seconds and a customer reload of about 26.1 seconds. This is separate evidence of an insufficient cumulative hosted journey budget; it does not prove the first missed click fixed itself.

Both attempts skipped the subsequent full three-customer hosted suite. Independent failure cleanup and post-cleanup deployment identity verification succeeded. Attempt-2 browser artifact `11108077904` was downloaded and its SHA-256 verified as `7dc7f39ee79025f3025d20c2ce6defe252eb3ca5db87302069f862da488dd3b9`. Raw traces may contain session material and are not republished here.

The separate [dynamic AI security analysis 36680673253](https://github.com/floriankreutzer/conference-manager/actions/runs/36680673253) stopped before analysis with `CAPIError: 400 The requested model is not supported`. This is unavailable supplementary analysis, not a successful security check and not a reported vulnerability. Required checks must not be waived on that basis.

## Bounded corrective change

The shared-role hosted journey now has a cumulative 300-second per-browser budget and a 720-second suite cap. Individual browser controls remain bounded to 15 seconds, navigation to 30 seconds, and the exact-origin/method/path mutation-response waiter to 30 seconds. The response waiter is registered before exactly one action and both promises are observed together. Failed mutations are not replayed.

Before the traced `Prüfung starten` action, the test scrolls the normal control into view, samples its geometry and centre-point hit target, and requires repeated stable observations. Observation is read-only and bounded; the final action is still one normal Playwright pointer click. No forced click, JavaScript event dispatch, hidden API substitute, route mock, test retry or skipped assertion is introduced.

The workflow still requires at least 2,700 seconds before starting destructive journeys. The shared-suite cap (720 seconds) plus unchanged full-scenario cap (1,500 seconds) leaves 480 seconds for independent cleanup, identity verification and evidence handling. Regression assertions bind those actual configuration values. The reset implementation, server reset budget, request limits, canonical checksum and successful/failed-run cleanup conditions are unchanged.

Four focused Node tests exercise the actual helper source: exact response matching and registration order, failure propagation without mutation replay, stable unobstructed geometry, and rejection of an obscured target. These are helper-level regression tests, not a substitute for real hosted browser results.

## Exit criteria

PR #224 remains a draft until the final candidate's real CI, hosted shared-role journey, full three-customer hosted scenarios, independently pinned canonical reset, deployment identity and applicable security/review gates have been verified. Old green runs do not satisfy a changed candidate. Only then may frontend #215/#212 and the API cross-repository release gate be completed.

SaaS 3.6 acceptance items remain separate. This work provides no live Microsoft, Production, formal WCAG or penetration-test certification. No manual database edits, role/tenant/CSRF weakening, new Render services or production changes are part of this correction.

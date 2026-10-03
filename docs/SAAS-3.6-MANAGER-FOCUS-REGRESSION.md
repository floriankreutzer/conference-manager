# SaaS 3.6 — Manager navigation focus regression

## Classification and failed evidence

Classification: **shared-business-domain**. The same Manager business-settings
renderer serves Production-shaped and Demo compositions; this is not a Demo-only
fixture issue. The release gate remains open until the correction passes its
required checks and is promoted to the exact deployed frontend/API pair.

Combined-head CI `37122896578` for `725f87f6a3eefcf50a7c5d90084c575d22f8d9e3`
failed two browser checks after the main/SaaS-3.9 integration:

- WebKit's unchanged `Conference Manager edits normal Room prices with Rooms
  and validates Catering names` test failed the invalid-name focus assertion.
  Artifact `11274352211` contains the trace. After selecting Catering, the fill
  action attempted whitespace, but the following snapshot still contained
  `Coffee`; Save therefore submitted the unchanged valid name. It is not
  evidence that the API accepted a blank catalogue name.
- The actual headed Chromium 200% zoom gate failed to open native field help
  with Enter after selecting Services & Equipment. Artifact `11273732855`
  shows focus on the global Manager heading rather than the help control.
  Earlier seven-task, sizing and horizontal-reflow checks in that run passed;
  the final business-help assertion did not.

The four real PostgreSQL CSV/cross-role journeys passed. The permanent full
three-customer/two-reset suite was **skipped after the zoom failure**, not
accepted. Ordinary browser results were 287 passed and one failed; the four
retired portal-only cases belong to the approved website ownership change.

## Correction

`focusCurrentHeading` scheduled heading focus through `requestAnimationFrame`
after constructing and connecting the interactive form. That later callback
could interrupt a subsequent focus/typing/Enter interaction. The correction
finishes the guarded heading focus synchronously at the end of rendering,
before control is returned to subsequent interaction. It retains revision,
connection, parent and session-lock checks and does not remove keyboard
navigation focus.

`tests/manager-settings-navigation-focus.test.js` exercises the real renderer
with a minimal connected-DOM double. It asserts immediate completion, no queued
heading callback, no initial unsolicited focus, and no focus from locked,
detached or superseded renders. These are scheduling/lifecycle tests, not a
substitute for native-browser accessibility evidence.

The previously failing ordinary-browser and actual-zoom tests are unchanged.
No timeout, retry, force-click, assertion, validation, permission or release
control is weakened. Business writes, CSV receipts, migration 42, deployed refs,
separate Customer/Platform authority and accepted Owner decisions are unchanged
by the source correction. The new frontend source still requires a reviewed
immutable paired deployment; an old live pin cannot certify this fix.

## Follow-up evidence

PR #259 records the executed new-head outcomes. Until all required browser,
PostgreSQL, full-scenario, Hosted cleanup/identity and security gates pass,
#229/#169/#170/#164 and milestone 10 remain open. The earlier Neon quota outage
is historical following the verified Launch-plan/readiness recovery; the
separate optional AI scanner quota is not the cause of these browser failures.

# Protected synthetic Customer confirmation

This optional Customer presentation is prepared under SaaS1 issue351. The
registered `customer.synthetic-handoff` flag defaults OFF. Ordinary Production
and both closed Demo artifacts are unchanged. This is not full protected INT
root, Microsoft, physical-key, provider, sender or deployment acceptance.

The production-only authentication bootstrap recognizes the exact sole
`auth=synthetic_confirmation` presentation hint. It displays the pending ceremony
for signed-out and already authenticated browsers. This hint grants nothing:
GET `/api/v1/auth/delegation/confirmation` must independently validate the
original browser and short completion cookies, approved source proof and current
scope. The browser accepts only the minimized known slot, role, cookie-presence
boolean, flow CSRF and request ID. No Tenant/User/operator identifier, provider
credential or reusable privileged proof is accepted as browser authority.

The user explicitly confirms the displayed organization and role. An existing
Customer cookie instead requires the separately named current-session logout.
Successful204 is followed by an independent confirmation read and another explicit
final confirmation. Unknown logout outcomes never cause automatic replay or
completion. The UI offers a current-state read; expired or revoked approval
requires a new ceremony. The backend must preserve other sessions and all real
membership/history. Browser checks do not replace that requirement.

Native POST document navigation is mandatory for completion and the login-page
Operator-test start action. Fetch/manual redirects cannot provide the required
cross-origin document navigation and SameSite behavior. The shared form adapter
permits only three fixed same-origin actions: empty Customer start, Customer
completion with flow CSRF, and future Platform approval with ordinary CSRF plus
bounded serialized assertion payload. No arbitrary action/target or extra fields
are admitted. Forms remain in the document through queued submission and are
removed on pagehide, explicit fresh-state reset or disposal. Flow proof is kept
only in memory and transient form controls, never storage or query parameters.

## Protected document policy

Actual WebKit navigation exposed an important distinction from raw HTTP tests:
`no-referrer` document policy serializes a native form's Origin as `null`.
The protected document must use `Referrer-Policy: same-origin` and the matching
meta policy. This preserves a concrete Origin on the same-origin POST while
suppressing Referer to the other origin. API redirects and secret-bearing
callbacks retain no-referrer and scrub their query before rendering a document.
The API must continue rejecting absent, null or foreign mutation Origin; accepting
null is not the remedy.

`scripts/protected-customer-html.mjs` prepares protected Customer HTML from the
canonical shell with explicit distinct validated HTTPS Customer/Platform origins.
It changes only the production/protected markers, same-origin document referrer
policy, fixed production entrypoint and CSP form-action counterpart. All other
CSP directives, shell assets and structure remain canonical. Ordinary index.html
keeps its closed Demo markers, no-referrer and self-only form-action. This helper
alone does not activate a flag, publish an artifact or configure server headers.
The owned static root must apply the matching same-origin document header; a
conflicting header/meta policy or self-only form-action cannot be ignored.

## Evidence and remaining acceptance

Focused tests cover closed response schemas, private proof custody, explicit
logout/completion, uncertain outcomes, stale/disposed views, bounded exact native
forms and positive/negative protected HTML generation. The new browser fixture
uses actual production modules and protected artifact bytes, scoped HTTPS
loopback API stubs and a real loopback server303. Playwright cannot fulfill303,
and a continued request's redirect destination bypasses route interception, so
the fixture serves a fixed protected landing document on the real local server.
It issues no cookie or identity grant. Tests check actual POST navigation and303,
DE/EN keyboard operation, focus, 200-percent text/320-pixel reflow and absence of
stored flow proof, explicit current-only logout, lost-response read and expiry.

Historical first browser failures remain failed: missing signed-out pending-view
composition was fixed; a new test's incorrect button-focus expectation was
corrected to the deliberate heading focus; a duplicate global alert selector was
scoped to main. Attempted intercepted303 was unsupported; a real server fixture
replaced it. The next real native run correctly failed400 with `Origin: null`
under no-referrer; document policy was corrected without weakening API Origin.
A redirected default Demo document was replaced with the actual fixed protected
fixture document. Initial HTML negative-test substring acceptance was corrected
by matching the complete CSP directive delimiter. No existing assertion, browser
coverage, production Origin rule, timeout or retry policy was weakened.

Full Chromium/WebKit/shared Demo and fresh exact counterpart gates remain
required before merge. Actual two-origin CSP/SameSite/production-MFA integration,
Operator generation/approval UI, protected business SIM disclosure, full roots,
immutable deployment and operating/recovery acceptance remain open. This Customer
component does not claim those results.

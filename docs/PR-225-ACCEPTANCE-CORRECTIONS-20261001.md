# PR 225 acceptance corrections — 1 October 2026

## Browser evidence

CI 36898967741 / artifact 11180822771 proved that the image check accidentally
included the explicit `Kein Catering-Paket` opt-out. It is not a product and has
no image. The check now requires exactly one opt-out without an image and all
12 real catalogue cards with loaded images and alternative text. Selection is
by the explicit opt-out ID, never by image presence; a missing product image
still fails. Existing replacement/restoration hash checks remain unchanged.

CI 36900434558 / artifact 11181721427 then reached guest information successfully:
the API returned HTTP 200 and the accessibility snapshot contains the dialog
`Willkommen zu „Northwind acceptance cycle 1“`. The new test had incorrectly used
the action button label as the dialog name. It now requires the exact localized
request-specific welcome title both on the dialog and its heading. Guest data
redaction and the real print popup assertions remain mandatory. No application
semantics or accessible naming was changed to accommodate the test.

## Exact informational DAST observation

ZAP run 36900433513, Customer job 110497941243, raw artifact 11180709197
(SHA-256 `92f4df06c868021a0040b719651400e7545aa1fcc9ecf250bfe69ca5fc6e3750`)
reported `90005-1` (Sec-Fetch-Site Header is Missing), risk code 0, on GET
`https://conference-manager-demo.onrender.com/assets/demo-security.css?v=20260830-77`.
This is a missing **crawler request header**, not a missing server response
security header or an authenticated API bypass. The same exact static resource
already has reviewed risk-0 entries for 90005-2, -3 and -4. Only the newly
observed subtype/URL pair is added; the risk policy remains unchanged at 0.

The validator tests still reject every reviewed subtype at higher risk, POST,
another version, another origin, authentication routes and unknown subtypes.
No wildcard URL, summary ignore, alert cap, disabled passive scanner or
allow-failure behavior is introduced. Evidence is retained unfiltered.

Primary rule definition: https://www.zaproxy.org/docs/alerts/90005-1/

## CI installation infrastructure

The old regional Ubuntu mirror took 17m07 to download 125 MB in hosted run
36895409244, job 110481020897. The job correctly refused destructive work because
the 2700-second cleanup reserve no longer fitted its 3600-second total budget.
The new step only swaps priorities of the two existing runner mirror entries,
putting the already configured official HTTPS Ubuntu archive first. Signing
keyrings, suites, package verification, fallback mirrors, browser coverage and
all budgets remain unchanged. Chromium/WebKit prerequisite installation then
completed in the corrected isolated CI, allowing the actual assertions above
to execute. No destructive cleanup guard is relaxed.

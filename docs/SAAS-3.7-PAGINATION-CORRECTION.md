# SaaS 3.7: signed Request pagination correction

## Reproduced defect

The trusted API's `src/application/opaque-cursor.js` emits Request v3 cursors as
`base64url-payload.base64url-HMAC`, with a payload bounded to 3072 characters and
a 43-character SHA-256 signature. The frontend instead reused the legacy
undelimited 2048-character cursor grammar for Request lists, reports and history.

Northwind has twenty seeded Requests. The first ten-record page returned HTTP
200, but its valid next cursor was rejected as `PRODUCTION_REQUEST_LIST_INVALID`.
Application initialization consequently displayed “Sichere Anmeldung nicht
verfügbar” despite a valid authenticated session. This is a shared-business /
Production-reachable defect, not merely a Demo failure.

## Correction and security boundary

Request v3 lists, reports and history now use the API's bounded signed syntax.
Version 2 and catalogue pagination retain their distinct legacy grammar.
Whitespace, extra separators, oversized payloads, invalid signature lengths,
unsigned v3 cursors and contradictory completeness flags are rejected. Existing
cycle, page-count, snapshot-generation and API error handling remain active.

The browser does not decode cursor claims, hold the signing key or validate the
HMAC. Expiry, purpose, Tenant, Principal and object binding remain exclusively
server-enforced. The cursor is forwarded unchanged as opaque continuation input.
No API authorization, CSRF, database, migration, provider or deployment setting
is changed. No visible UI strings or styles are introduced.

The existing generation-downgrade regression now uses a syntactically valid v3
cursor and asserts that the second envelope was actually requested before its
downgrade is rejected. It no longer passes prematurely on an invalid fixture.
New tests cover the three pagination surfaces, legacy separation, token bounds,
continuation, cycles and unchanged catalogue restrictions.

## Evidence and limitations, 2026-09-29

Local frontend input: Actions artifact 11040100933 from run 36582200446,
source snapshot `e858c83e972c030ae5f9bf6a6a88880ba0766839`.
Local API input: private artifact 11039918974 from run 36584025393,
source snapshot `d4ece2dfc8e62261843677c077947fdaa23519e3`.
The frontend patch target is PR #224 at
`94bf492d2844a113a1986114d2d32952ec59c472`. Its changed target files were fetched
and verified unchanged between the input snapshot and that head. In particular,
the original wire-parser blob is `1a703de658f8e68724e4adc89a06896dbc79816c`.
The entire newer PR tree was not reconstructed for these local executions.

Executed after the correction: 48 focused persistence/pagination tests; the
local baseline quality gate (495 tests after both prepared corrections);
137 Chromium browser regressions passed and one pre-existing explicit actual
browser-zoom test was skipped by its normal configuration. The real isolated
PostgreSQL/browser reproduction failed before and passed after this exact
parser change, displaying twenty unique Northwind Requests and following signed
continuation cursors with HTTP 200. No application API responses were mocked.

`npm run audit` was attempted but the network-disabled execution environment
could not resolve the npm registry; no fresh audit success is claimed. WebKit,
the full new three-customer progression/reset suite, current-PR CI, merge and
hosted rollout remain unverified for this patch. GitHub write/dispatch tools
were not available in this session. These local results are not a full SaaS 3.7
acceptance or Production security attestation.

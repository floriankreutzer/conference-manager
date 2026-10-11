# Hosted acceptance transport candidate

This test-only change prepares an explicitly origin-bound acceptance runner. It
does not establish a hosted cutover, approve a new recovery environment, change
the deployed services, or prove that a complete acceptance and cleanup fits the
API's absolute acceptance deadline. Required repository checks and exact
counterpart review remain necessary.

## Existing regression behavior

With `CM_DEMO_ACCEPTANCE_MODE` absent, context creation passes through the
original Playwright options. The Shared runtime keeps the fixed local TLS edge,
including the existing hosted reverse-proxy workflow. SaaS 3.7 and CSV keep their
existing strict, paired hosted-origin configuration. Browser projects, timeout
budgets, rate-limit waits, personas, tenant boundaries, two-cycle reset behavior,
and scenario checks are retained.

Eleven context creation sites bind their intended origin explicitly: four Shared
runtime contexts, three SaaS 3.7 contexts, two CSV contexts and two browser-zoom
contexts (one persistent). Binding is selected when creating the context, never
inferred from a later role, request order or URL. Test code does not import or
receive an acceptance token.

Exactly two existing browser assertion operands change: the Shared cookie-domain expectations use
the hostname of their strictly validated Customer or Platform origin instead of
the literal local hostname. Cookie names, strict equality and opposite-session
absence checks remain unchanged. The extracted origin resolver permits only the
original local pair or the two exact hosted origins; wildcard, suffix, alternate
port, credentials and partial pairs remain invalid.

The headed 200% Chromium zoom check remains the dedicated credential-free CI
step. Its existing condition requires both `CM_ACTUAL_BROWSER_ZOOM` and project
`chromium-shared-demo`; the hosted workflow has neither that flag nor that project
name. Its explicit CDP PNG evidence and all zoom assertions remain unchanged.

## Explicit gated configuration

`CM_DEMO_ACCEPTANCE_MODE=gate` is the only gated mode. An unknown value fails
closed. Both approved hosted origins are required. Hosted and SaaS 3.7 configs
disable the local reverse proxy, retain certificate validation, and disable
automatic traces, videos and screenshots. Existing suite and assertion budgets
are unchanged. Tokens belong to the guarded runner/transport and use only the
acceptance header; they do not become a persona, session, CSRF value, URL or
cookie. Normal application authentication and authorization checks still apply.

The ordinary CI job must run isolated transport security checks with real
Chromium, WebKit and API requests. Their temporary local CA is installed into
normal browser trust stores and removed during cleanup. These checks neither
contact hosted Demo services nor use provider credentials; they must fail when
an engine or required trust setup is unavailable.

The threat model is reviewed test code on the pinned Playwright 1.63.0 runner
handling untrusted responses and DOM content. The API strips the gate header
before normal application dispatch. This is not an operating-system sandbox for
arbitrary code, native browser downloads or browser profiles; existing CSV
downloads remain part of the acceptance scenarios. The TLS egress proxy bounds
ClientHello input to 65,536 bytes, each record to 16,384 bytes, handshake time to
five seconds, idle time to 120 seconds and concurrent sockets to 128. Run
`node scripts/test-hosted-transport.mjs` for local TLS/API/guard checks and append
`--browsers` for mandatory real Chromium/WebKit canaries, without fallback or
optional browser skips.

## Immutable cross-repository copy contract

API CI must check out the exact reviewed acceptance commit and invoke:

```sh
node acceptance/scripts/copy-shared-acceptance.mjs \
  --source acceptance --target frontend --ref "$ACCEPTANCE_REF"
```

The helper verifies the source checkout's exact HEAD and every selected Git blob
before copying the explicit Shared spec and its support dependency set. It
rejects dirty selected sources and symbolic-link redirection, reports SHA-256
digests, and never copies served application sources, config files or workflows.
Run it after the supported Node setup. The complete SaaS 3.7 journey continues to
run from the immutable acceptance checkout. Changing the frontend acceptance pin
requires coordinated API review; this candidate alone changes no API pin.

## One bounded hosted journey

The existing workflow defaults to `ordinary`. Its explicit `gate` input is
accepted only on `refs/heads/main`; two service tokens enter only the guarded
orchestrator step's environment. The `expires_at` input is the already approved,
canonical UTC expiry shared by both services. The runner never generates or
extends it. A maximum 90-minute application acceptance window is independent of
any provider resource TTL or recovery authorization.

The gated orchestrator performs bounded real-origin readiness, verifies both
build identities against the reviewed workflow pins, and then requires at least
4,200 seconds before both the absolute gate expiry and the existing 4,800-second
job deadline. Therefore destructive work may begin no later than 600 seconds
after the recorded job start. Missing or altered budgets fail closed.

It runs the complete Shared suite and complete SaaS 3.7 suite in that order. The
original combined browser global caps remain 1,320 and 2,280 seconds. Their
3,600-second sum leaves 600 seconds for bounded failure diagnostics, two
independent canonical resets and post-journey identity verification. The existing
session/reset request limits and bounded metadata retries remain unchanged.

Once a destructive suite can have started, cleanup and identity verification are
attempted independently even after a suite exception. A Shared failure retains
its bounded reset-failure diagnostic before cleanup. Both suites, cleanup and
final identity must all pass for success. Expiry never reopens access or grants
cleanup an extension; a missed deadline remains a failure. The supervising
process bounds its Node process group by the same gate and job deadlines.
Playwright launches native browsers in separate groups, so this group signal by
itself is not proof of native-browser termination after forced shutdown. Actual
Chromium/WebKit deadline and cancellation teardown remain a separate verification
requirement; the transport proxy independently closes token-bearing egress at
the absolute expiry.

## Restricted evidence and failure correlation

The guarded runner persists only closed-schema summaries, fixed journey phase
outcomes, the original strict
SaaS 3.7 scenario evidence, an exact failed-reset correlation, and bounded reset
audit evidence. The workflow enumerates those JSON paths; it does not upload raw
browser reports, traces, HARs, videos, screenshots or unstructured process logs.
The fixture records a UUIDv4 `x-request-id` only for an unsuccessful Platform
`POST /api/v1/platform/demo/reset`, replacing the old loopback proxy's correlation
capture when gate mode uses the real origins. Diagnostics retain the matching
reset audit event, canonical timestamp and accepted API reason enum, or explicit
unavailability (all three audit fields are `null`). `journey-phases.json` records
each preparation, suite, cleanup and identity stage as `not_started`, `passed` or
`failed`; reset audit is separately `not_started`, `unavailable`, `matched` or
`failed`. Thus a failed suite with successful cleanup remains distinguishable
from failed cleanup. An absent phase file after a forced crash proves neither
cleanup nor identity. A missing or invalid reset
request ID fails the request and journey; it never counts as a matched audit
event. No secret-bearing response body or exception cause is persisted.

Native readiness, reset, identity and audit requests bind to their exact service
origin with ordinary TLS verification, redirect rejection and absolute deadline
abort. The gate header supplements the existing session, Origin and CSRF headers;
it does not replace any of them. Identity mismatch errors no longer echo remote
commit-field strings. Ordinary mode retains its existing textual evidence.

## Review and release status

This candidate is based on frontend main
`ee541cdb1f2c9c5605421a6f48968ac773fd05f9`. The historical acceptance reference
`6228a827502b2cb59c8b9c50adebb9ad6431fe8b` is an audit reference, not a rollback
base. Main additionally contains the accepted API-pin updates and historical
reset cleanup bindings in eight workflow/documentation/reset-test files. Those
changes are retained. The browser specs and configuration matched the historical
reference before this transport integration.

The test-only dependency boundary is checked by the actual ES-module graph of
the explicit immutable copy contract, alongside real transport security tests.
Implementation-coupled workflow/source assertions follow the new mode branch and
bound fetch function; their cleanup, checksum, ordering and budget conditions are
retained. This is distinct from the two cookie-domain expectation operands above.

Repository checks, both real browser security canaries, the complete cross-repo
regression suites and exact counterpart review remain release gates. A successful
local unit test is not hosted deployment evidence. The final reviewed API runtime
pin and its explicit reset allowlist binding must be coordinated before gated
operation. No workflow dispatch, provider resource, credential creation or hosted
cutover is performed by this source change.

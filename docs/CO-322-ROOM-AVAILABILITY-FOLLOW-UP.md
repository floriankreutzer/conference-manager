# CO-322 — Room availability investigation and acceptance

## Scope

CO-322 remains the authoritative work item for the reported booking blocker and
its product acceptance. This follow-up defines the evidence needed for a scoped
fix. The cause is unresolved; no implementation correction or live acceptance is
established by this document.

The reported Employee journey reaches room selection with sufficient capacity,
then displays a failed calendar check and keeps Next disabled. An HTTP 200
observed in server logs has not been bound to that browser response and its
validated contents. Missing room images remain a separate observation.

Preserve the existing [persistence contract](PRODUCTION-PERSISTENCE-CONTRACT.md),
[security boundary](PRODUCTION-SECURITY.md), [screen contract](CUSTOMER-QA-SCREEN-CONTRACT.md)
and [permanent scenario acceptance](SAAS-3.7-SCENARIO-ACCEPTANCE.md).
The backend remains authoritative for Tenant, session, policy, availability,
concurrency, request state and writes.

## Inspected source boundary

The source comparison uses reported deployment frontend
`83f883dbccd76a28050f1981c8431f18174f04e7` and reviewed frontend
`0b89158a98332415a7bdfe4d74c6a6bb945dd055`.
The reported deployment API is
`c146aeab3501b73d71d2fde70cb5b102d4d617a6`.
These historical identifiers do not establish the currently deployed pair;
verify the real deployment identities before reproduction.

In the [complete API comparison](https://github.com/floriankreutzer/conference-manager-api/compare/c146aeab3501b73d71d2fde70cb5b102d4d617a6...2b9a7f4fbeaba3688877d045337a1c00e3eda5de),
the only changed regular file is
`docs/RENDER-PROTECTED-BUILD.md`; all API product files, including the availability
route and service, retain identical blobs and modes. The separate
`vendor/protected-frontend` Gitlink changes from `83f883db` to
`17c28fb615264e6a2eccc7ed6e46d20171cb66e3`. The full tree comparison includes both
differences. Unchanged API sources do not establish equal deployed frontend
bundles or runtime configuration and cannot replace the missing live response.

These files have identical Git blob objects at both inspected frontend commits:

| Source | Git blob |
| --- | --- |
| `src/core/api-client.js` | `462176f3553c12751f36db196918935284281a96` |
| `src/platform/production-persistence.js` | `02c1de47c50e40c2a3c9bd7ebe40bda1caa4d138` |
| `src/employee/production-time.js` | `6ab1591d8569e95f91f7a834662f30eb6d662333` |
| `src/employee/server-request-editor.js` | `50ebd83f7031c336f414517cc60ed0d7d243558c` |
| `src/employee/server-request-workflow.js` | `674b15a05135047871b7f6842845421c3c619dc4` |

The complete availability click handler in
[`production-application.js`](https://github.com/floriankreutzer/conference-manager/blob/0b89158a98332415a7bdfe4d74c6a6bb945dd055/src/employee/production-application.js)
is also byte-identical between these commits. The whole Employee application
and its room-media module differ elsewhere; this comparison does not establish
identical applications or unchanged surrounding rendering.

The current source separates these stages:

1. Validate the selected room, capacity, authoritative Site time zone and future
   UTC interval; invalidate any previous verification when its inputs change.
2. Send the same-origin availability request through the bounded API client.
   A successful HTTP status still requires a readable bounded JSON response.
3. Validate the exact schema-version-1 envelope and its availability projection:
   `available` is boolean, `conflictCount` is 0 or 1, and both must agree.
4. Apply the result only to the current editor, generation and room/time tuple,
   then update room controls and the active step.

The handler's catch covers both the awaited persistence operation and subsequent
synchronous presentation updates. The generic calendar-error message therefore
does not identify transport, response validation, provider or rendering as the
cause. An ordinary occupied result has a separate presentation. Preserve this
distinction when classifying the actual failure.

## What existing positive evidence establishes

Focused adapter and composition checks recorded with CO-322 establish their
isolated valid/occupied contracts. They do not reproduce an authenticated
deployed browser response.

[Native source qualification](https://github.com/floriankreutzer/conference-manager/actions/runs/42746409149)
passed both complete 609-case engine suites and the PostgreSQL-backed
three-customer progression with two reset cycles at frontend `0b89158`.
Its immutable API counterpart is
`2b9a7f4fbeaba3688877d045337a1c00e3eda5de`.
This is positive evidence for that isolated pair. It neither identifies the
reported deployed failure nor establishes real provider or Safari acceptance.
Keep source CI, deployed identities and product acceptance separate.

## Minimal reproduction and diagnosis

1. Use an already authorized Customer Demo/session and the supported normal
   browser path. Record immutable frontend/API identities, relevant wrapper and
   seed/reset versions, locale, engine/browser version, viewport and Site time
   zone. Use only an explicitly authorized account/session; the existing access
   restriction remains in force.
2. Use synthetic data and a future valid interval for a known active room with
   sufficient capacity. Reproduce the existing request steps and activate the
   calendar check normally. Retain the request lifecycle; do not fabricate
   availability or force an enabled control.
3. Bind the browser's check to the actual responding route and outcome. Retain
   only bounded classifications: request count, relative event order, status,
   expected JSON media-type match, response-size classification, schema/key/type
   validity, availability booleans/count, and resulting step/button state.
   For exceptions retain only reviewed error-class/code categories and the
   owning stage; classify unknown values without logging raw messages.
4. Determine the first failing stage before editing its owner. Add a
   deterministic negative reproduction and a positive progression case at that
   boundary. Preserve exact validation, authority, concurrency and lifecycle
   guards. Do not loosen assertions, retry failures into success or extend
   deadlines without a separately demonstrated infrastructure cause.

Do not publish raw responses, traces, HARs, cookies, headers, tokens, identities,
private calendar details, real booking content or internal deployment identifiers.
Keep minimized dated evidence and acceptance decisions with CO-322. Public
regression fixtures must be synthetic.

## Required progression and regression

Run the relevant cases in German and English in both existing Chromium and
WebKit/iPhone profiles. Preserve normal pointer and keyboard activation, visible
focus, localized status/error semantics and usable narrow layouts.

| Case | Required outcome |
| --- | --- |
| Available room and valid interval | Calendar verification enables the legitimate next step. Complete the authorized request/booking lifecycle, confirm the authoritative write once, and read back the expected Employee and Manager state after reload. Distinguish workflow-start events from request creation. |
| Occupied room | Occupied status is explicit; progression and submission stay blocked. |
| Capacity, invalid/past time or missing authoritative time zone | Invalid input cannot create availability authority or a request; the existing correction path remains usable. |
| Room/time/context changes while a check is pending | Stale completion cannot validate a newer tuple or restore an invalidated editor. A new valid tuple requires a fresh check. |
| Unavailable provider, transport failure or malformed successful response | Fail closed with the appropriate localized state; a later valid check can recover without retaining a false verification. |
| Expired/changed session, inactivity lock, cross-Tenant scope or invalid CSRF | Existing server and browser authority controls remain effective; no unauthorized read/write or stale presentation restoration. |
| Final write conflict or repeated activation | Existing idempotency and backend concurrency controls prevent duplicate authoritative booking/request outcomes. |

For the original reported Safari path, retain the actual browser result
separately from automated WebKit evidence. Apply the current repository test
strategy, `npm run check`, `npm run audit`, relevant complete browser suites,
protected boundaries and permanent three-customer/reset gates to the final
immutable frontend/API pair. Required reviews and Main qualification remain
mandatory.

CO-322 can be accepted only after the cause is supported by direct evidence, the
scoped correction and negative/progression tests pass, and the authorized
deployed journey succeeds on the identified pair. An unexecuted live case stays
open even when isolated source checks pass.

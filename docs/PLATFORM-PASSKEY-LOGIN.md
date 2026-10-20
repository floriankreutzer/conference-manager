# Platform passkey login candidate

## Ownership and status

Issue355, within SaaS1, owns the Microsoft primary plus application-passkey decision.
This candidate adds production-only browser serialization, login/setup orchestration
and DE/EN presentation. It does not activate an API identity mode, enroll a real
owner device, deliver email, assign privileges or complete an INT cutover.

The server remains the only authority for Microsoft identity, independent bootstrap
approval, key ownership, possession, active key minimum, expiry, attempts, roles,
sessions and recovery. Customer identities and Tenant Operators cannot become
Platform operators through this UI. Shared Platform presentation consumes only an
injected session-gate renderer; the Demo graph never imports production identity.
The production artifact manifest includes the three required production modules.

## Browser contracts

The browser adapter requires a secure canonical HTTPS origin and the exact hostname
as RP ID. It accepts only bounded positive native option schemas, required user
verification/resident registration, no attestation and ES256. It serializes native
ArrayBuffers to canonical bounded base64url JSON and retains no raw native error.
A single native prompt can run at once. Cancellation, duplicate registration and
unsupported environments have fixed presentation-safe error categories.

The login controller uses the existing same-origin API client, including bounded
JSON responses, no redirects/cache/referrer and HttpOnly session cookies. It reads
configuration and pending enrollment/authentication from the API. State is echoed
in the CSRF header and body for preauthentication writes. It stores no grant,
credential, pending options or identity in local/session storage, URLs or logs.
Only deliberate button actions start native registration/assertion prompts.

First enrollment requires an independent owner grant ID/code entered in a labelled
form; input is cleared on submission. Registration and signed possession are
separate stages. A reload resumes only what the API reports through its narrow
HttpOnly cookie. Setup can finish two keys without creating a business session.
Only an active API mode and explicit authenticated result reload the workspace.
A missing configuration endpoint preserves the existing CA sign-in entry; other
configuration/network failures remain visible rather than selecting another mode.

The current candidate covers unauthenticated login/setup only. Authenticated key
management, exact business-operation proof, deployment configuration, owner-device
acceptance and recovery rehearsal remain separate required work.

## Presentation and accessibility

All new copy belongs to the existing central Platform DE/EN catalog. Native forms,
labels, password input for the setup code, buttons, status/error regions and logical
heading structure reuse existing UI components and design tokens. Sensitive grant
input is absent after phase change. Focus follows asynchronous transitions only
when this view replaced the focused control; locale/navigation focus is preserved.
No new styling layer, external asset, framework or runtime dependency is introduced.

## Dated validation

On2026-10-19 local `npm run check` passed756 tests, including native-codec and
controller progression/negative tests; `npm run audit` reported zero vulnerabilities.
WebKit UI fixtures passed bootstrap, distinct possession, reload, DE/EN switching,
keyboard focus, cancellation/retry and320/1280px overflow checks. The native-codec
WebKit fixtures passed separately. These fixtures use injected native credential
ports and API responses; they do not prove real cryptographic/device enrollment.

Local Chromium could not start because its pinned executable was unavailable.
The standard official full-browser and headless-shell downloads returned invalid
ZIP files. No browser pin, assertion or gate was changed. Required Chromium and
complete regression/three-customer/reset CI remain open until exact-head checks
finish; local WebKit evidence does not replace them. No formal WCAG, penetration
test, deployed-runtime or owner-authenticator compliance is claimed.

## Operation proof and own-key follow-up candidate

A separate follow-up composes the production-only operation client only when the
API explicitly reports `application_passkey`. Legacy CA keeps its existing entry;
unknown/unavailable configuration remains closed. Shared presentation may offer an
existing permission for a request that obtains its own proof, without changing the
operator's MFA level, roles or permissions. Missing roles and unavailable Tenant
actions remain hidden; Demo cannot enable this production transport.

The existing API client still owns URL/method/body/idempotency validation and bounded
normal responses. The decorator handles only an explicit428 challenge, validates a
closed JSON response of at most16384 bytes and invokes the native assertion adapter.
It resends the exact original request once with `X-Platform-Passkey-Proof`. Network,
timeout, conflict, throttling and provider errors never retry a mutation. Proof-
capable requests are serialized before any challenge cookie can change, with a
maximum five queued requests; ordinary reads remain parallel. CSRF is refreshed at
actual dispatch, including sensitive GET proofs, and the normal session is reloaded
after successful execution. Failed post-commit session refresh reloads the workspace
rather than encouraging another mutation. No elevated cookie enters browser code.

The personal Passkeys dialog lists only positively validated own-key metadata.
Unknown fields (including public-key persistence data), duplicate/overlong IDs and
invalid dates fail before rendering. A failed initial list cannot enable key changes.
Adding requires an existing-key operation proof, then separate native registration
and possession, reusing the same pending-flow controller without exposing a grant.
Revocation binds the selected credential, requires an existing-key assertion and
ends in fresh sign-in. Removing one of two keys requires replacement before future
business login. The server retains capacity, ownership, last-key, recovery and
operator-version authority. A Customer Tenant Operator receives no Platform rights.

All new controls reuse native buttons, modal/form/focus components, centralized DE/EN
copy and existing tokens; no new CSS or dependency is needed. Closing/navigation
aborts outstanding prompts and clears component memory. Local WebKit fixtures cover
concrete lifecycle proof/cancellation, normal-session refresh, own-key addition,
distinct possession, exact revocation target, private-field rejection and320/1280px
modal/document overflow. Their injected credentials/API are browser interaction
fixtures, not owner-device enrollment or independent cryptographic acceptance.

The initial new lifecycle UI fixture used the wrong exact label for the existing
required Operational reason field and timed out before dispatch. It was corrected
to the actual accessible label; all four operation/key-management WebKit cases then
passed. No product assertion, timeout, browser pin or required gate was weakened.
Complete final checks and exact-head CI remain separate evidence for this follow-up.
The earlier current-candidate limits above describe the accepted login/setup base;
these additions remain unmerged and do not activate INT or complete SaaS1 acceptance.

Final local follow-up validation on2026-10-19: `npm run check` passed764 tests;
`npm run audit` reported zero vulnerabilities. The final four WebKit operation/
management fixtures passed, including320/1280px document and dialog overflow.
Chromium and shared-Demo CI for this new follow-up remain required; the successful
Chromium checks for merged357 do not substitute for this different source tree.


## Own-key keyboard focus review correction

A management action now moves focus from its replaced trigger to the busy status.
Completion/cancellation/error restores an available management control. Successful
addition transfers focus into the registration view; while that view has no enabled
control during loading, its focusable heading preserves focus across updates.
The Close button remains available and Escape returns focus to the opener through
the existing modal component. Deliberate focus outside the replaced content is
preserved. No new copy, CSS, credentials or browser authority is introduced.

The added keyboard fixtures retain the native prompt pending, assert focused busy
status, reject it with cancellation or failure, verify the restored control and
Escape/opener focus. The existing successful addition fixture now also asserts
keyboard-triggered transfer to the registration heading. An initial implementation
passed both failure paths but exposed another focus loss in the reused loading
view; that view now falls back to its heading when no control is enabled. These
interaction fixtures do not establish real authenticator or assistive-technology
acceptance; current-head complete CI remains separately required.

The final focused WebKit run passed six login/setup/management cases, including
busy, cancellation, failure, successful registration transfer and opener return.
It retains the320/1280px overflow and DE/EN checks. No assertion, timeout, browser
pin or required gate was weakened. Full current-tree validation is recorded
separately from this focused browser result.

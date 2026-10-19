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

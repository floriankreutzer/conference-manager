# Microsoft sign-in control

## Governing sources and scope

Follow [ICON-SYSTEM.md](ICON-SYSTEM.md#microsoft-authentication-control), the
[design system](DESIGN-SYSTEM.md), root instructions and current coding/security
standards. The [official Microsoft guidance](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps)
was rechecked for this implementation. This document describes the shared native
renderer and its verification boundary; it does not define another branding or
authentication policy. Source integration does not prove Hosted or real-provider
acceptance. Issue399 MS-01 retains its complete acceptance scope and requires
separate operating evidence.

## Inventory

| Owner | Sign-in entry | Preserved behavior |
| --- | --- | --- |
| Customer app shell | Microsoft-only fallback | Existing authentication port and fixed login destination |
| Customer invited authentication view | Microsoft beside email code | Existing explicit callback; email-code capability remains independent |
| Platform application shell | Session-gate fallback | Existing validated sign-in path |
| Platform login view | Signed-out Microsoft and legacy passkey setup return | Existing fixed operator login path; new-tab isolation when a delivery request is pending |
| Platform section actions | Legacy Microsoft step-up return | Existing fixed step-up port and fresh target/reason confirmation |
| Platform synthetic workspace / Owner customer view | Expired operator session reauthentication | Existing fixed native reauthentication form and explicit pending-intent checks |
| Platform Microsoft operation dialog | Additional sign-in for one exact operation | Existing authorization URL, independent tab, status/timeout/cancellation and exact-operation proof binding |

The active signed-out Platform composition reaches the login view through the
shared authentication-page frame. Both Customer and Platform frame content reuse
their own entry owners; a shared visual frame does not share sessions or authority.
Current API0c84b853's script-free Microsoft operation `/complete` page contains no
sign-in control and remains unchanged. Tenant Admin organization consent/connect
and explicit account-link business actions are distinct from ordinary sign-in and
retain their own labels and authorization contracts. No identity-account-policy,
application-passkey requirement, Owner roles or consent permission changes here.

## Renderer and bounded manufacturer styling

`src/core/microsoft-sign-in-control.js` renders a native button or anchor with a
visible central DE/EN label and decorative local original Microsoft symbol. The
label is supplied by each existing central catalog; all actual entry labels are
`Mit Microsoft anmelden` / `Sign in with Microsoft`. The original21-by21 SVG
canvas, containing the manufacturer's19-by19 colored geometry, retains SHA-256
`929f48f88c8ca7f3f5d294be47ec4caf51acc28ac25340c19a903125d7ecd84a`.
No recoloring, tracing, external request or SVG/HTML injection occurs.

The light control uses narrowly named manufacturer tokens. Segoe UI is preferred
where available and falls back through the functional font stack. Product Inter/
Manrope typography and Bordeaux controls remain unchanged. The current font/weight
scale provides15px/600 at the default root size; horizontal inset and gap reuse
12px semantic spacing. Width follows localized text and can reflow. The existing
44px minimum control target is retained rather than shrinking it to the redlines'
recommended41px artwork height. The manufacturer's21px symbol canvas is distinct
from a Pavurel functional icon. Existing visible focus and reduced-motion behavior
remain; decorative images have empty alt text and are hidden from the accessible
name.

The design gate permits the manufacturer font token only inside the exact
`.microsoft-sign-in` rule in `assets/styles.css`. It continues rejecting that token
in other selectors/files, literal font families, uncontrolled colors, changed
global Inter/Manrope rules, untrusted fonts and missing provenance. Both explicit
Platform inventories include the helper and symbol. Customer packaging continues
using its existing graph/asset rules; no reader extension, CSP or byte-limit change
is implied.

## Additional-operation context

The additional-operation dialog describes the requested action, selected customer
and, for customer access, the selected role. Recovery also names its existing
canonical procedure. It explains why another Microsoft sign-in is required, that
it opens in a separate tab, and that proof/current authorization are checked before
execution and the resulting outcome is shown. It does not promise business success
from signing in. Sign-in, organization consent and operation approval remain
distinct; normal MFA and Owner roles are unchanged.

The Platform-owned presentation adapter captures a frozen minimal descriptor from
the exact fixed URL/method/serialized request before it enters the existing proof
queue. It never reads the current DOM or route. A bounded200-entry in-memory name
map receives only already-validated directory/Owner-intent projections and is
cleared on page exit. Missing names use a localized selected-customer label plus
the exact identifier in native technical details. Recipient, reason, proof and
request body are not retained in descriptors or sent as new headers/payloads.
Later directory or language changes cannot replace an already queued target.
The shared transport, exact retry URL/body/key, native Owner form, one-use custody
and status/timeout/cancellation rules remain unchanged. Legacy injected clients
without this presentation port retain a generic dialog; the actual protected
bootstrap supplies it. Names describe a target and grant no authority.

Dialog labels update without replacing their native controls or technical details.

## Verification

Progression tests cover category/target selection, bounded names, immutable queued
context, unknown cases and current real/Demo workspace targets. Existing actual
bootstrap browser cases additionally check operation/target/role copy, DE/EN,
narrow reflow and preserved keyboard focus while retaining their original exact
request/cookie/native-form assertions. Source tests are not live acceptance.

The added Node regressions bind unchanged symbol bytes and both inventories, and
execute the design validator against a valid copied fixture and negative global,
sibling-selector, literal-font and separate-file mutations. Entry browser tests
check actual symbol loading, accessible labels, keyboard focus, computed vendor
typography/colors, target height, DE/EN switching and320/1280px reflow. Existing
Microsoft operation and protected owner journeys retain their callback/cookie,
request/body/idempotency, cancellation and one-use assertions; only the intended
visible provider label changes. Complete engine, protected artifact and permanent
three-customer/reset gates remain required. These are isolated tests, not formal
WCAG certification or real Microsoft approval/device evidence.

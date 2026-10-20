# Invited Customer sign-in

## Ownership and runtime boundary

The Production Customer bootstrap composes Microsoft sign-in and the email-code
flow through `src/platform/customer-authentication/`. Its client owns only five
fixed same-origin HTTPS email endpoints. Its controller owns transient workflow
presentation; its view owns native forms, focus and localized feedback. Ordinary
roles, permissions, Tenant lifecycle and application capabilities remain exclusively
in the existing validated server-session runtime.

The shared shell consumes an injected sign-in presentation port. It does not import
real email transport. Closed Customer Demo reachability into the new authentication
modules is forbidden directly and through intermediaries. Platform operators retain
their independent Microsoft/passkey boundary; Customer email proof cannot satisfy it.
The central message catalog is shipped in both existing Platform artifact manifests,
without adding Customer authentication code to either Platform surface.

## Browser behavior

- Microsoft uses the existing fixed sign-in entrypoint.
- Email accepts the invited address and DE/EN locale. Responses disclose no mailbox
  admission, recipient, challenge ID, browser proof, roles or independent Tenant ID.
- Eight-digit codes retain leading zeroes and use native one-time-code autocomplete.
  Submitted email/code values leave their fields immediately and are never stored.
- Only proved current choices contain an opaque membership reference and a safely
  rendered display label. Even one choice requires explicit selection.
- Selection is sent once. Its successful response triggers the existing ordinary
  session validation and a fixed-root reload. An ambiguous selection response or
  failed refresh offers a session check, never automatic acceptance replay.
- Reload and failed choice loading resume from the HttpOnly transaction through the
  server pending endpoint. They do not resend or reverify a consumed code.
- Browser memory holds the server's current CSRF only inside the client. No email,
  code, proof, choice authority, cookie or role is written to browser storage or a
  URL. The existing bounded language preference remains non-authoritative.

The existing bounded JSON/error decoder is reused by a deliberate fixed-endpoint
transport. HTTPS origin, response schemas, duplicate/oversized choices, canonical
identifiers, exact expected status, canonical expiry, current proof and bounded
clock skew are checked. Redirects are rejected, ambient cross-origin credentials
are omitted and calls have a bounded deadline. These checks do not replace server
proof, invitation, User/Tenant/role, expiry, CSRF or transactional admission guards.

## Accessibility, localization and design

Native labels, required inputs, select placeholders and submit buttons provide the
form semantics. Hints use described-by relationships outside their native labels.
Wrong proof marks the code invalid and restores input focus. Busy transitions focus
a status; code/choice transitions focus the heading. Language changes preserve
unsubmitted input and restore language-control focus. Errors use the main region's
alert, and server display labels use text nodes. Existing field/card/button/layout
components and design tokens are reused without new CSS or a parallel component
system. Expiry uses the existing locale-aware date/time formatter.

Invitation audit summaries now translate issued, reissued and revoked states in
both languages. Prior revisions remain supplied by the trusted backend projection.

## Validation and activation limits

Six isolated WebKit browser cases passed against the guarded loopback HTTPS
fixture, covering explicit admission, leading zeroes/current CSRF, keyboard/focus,
DE/EN, reload/recovery, no automatic mutation replay, safe display text, 320/1280
CSS-pixel reflow and 200-percent root text enlargement. Two cases render the real
Tenant audit section and its public adapter in DE/EN. Sixteen focused client,
controller and Demo-boundary cases also passed. Earlier fixture failures and
unavailable-runtime attempts do not count as successful verification.

The fixture rejects non-loopback requests and sends no provider mail. Browser
fixtures do not prove native database concurrency, real sender delivery, Microsoft
account linking or physical-key possession. Chromium, complete exact-head CI,
security review, backend route activation and protected INT acceptance remain
separate gates. Real invitation administration, durable eligible delivery/retention,
explicit dual-proof Microsoft linking and identity/history-preserving INT reset
are not implemented by this frontend slice. No production login mode or provider
configuration is changed by this source work.

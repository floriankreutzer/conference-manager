# Microsoft action confirmation (source candidate)

The protected Platform keeps its existing application and business dialogs after
normal Microsoft MFA login. An explicitly authenticated operation capability
selects the Microsoft proof transport;404 preserves the older profile without
pretending a capability exists. Application-passkey management is not mounted in
the Microsoft profile. The browser never supplies identity, scope or permission
authority.

The shared operation client serializes proof-capable requests before any pending
cookie can change. Only an explicit428 challenge may lead to one retry, retaining
the exact original URL, method, serialized body, idempotency key and source CSRF.
Unknown/network/status/conflict errors and cancellation do not retry a mutation.
After successful execution, the existing normal-session endpoint refreshes CSRF.
Missing refresh requests a reload; it never retries the committed operation.

The Microsoft challenge is closed and bounded. Its HTTPS authorization URL must
use the organizational Microsoft host/path, exact same-origin operation callback,
openid/profile, code/query, PKCE, max-age0, matching state and the bounded MFA/time
request. No provider response, external redirect, role or token is persisted or
treated as permission. The signed server-side proof remains authoritative.

The native dialog reuses existing design tokens/components and central DE/EN
messages, restores focus, supports Escape/cancellation and translates while open.
Only an explicit keyboard/pointer link activation opens a separate noopener,
noreferrer tab. COOP same-origin stays enabled. The parent does not rely on an
opener, postMessage, browser storage, redirect fragment or elevated cookie.
Bounded same-origin CSRF-protected status POSTs run at most60 times, two seconds
apart, with a115-second dialog deadline and ten-second request limits. Final
execution still needs the current source session, independent Strict operation
cookie and exact one-use proof at the server.

The paired API source is 387654a132ef4fd02c122021aeac706574a3ff20 in API314.
Both protected and shared-Demo CI jobs pin that immutable counterpart; existing
Chromium/WebKit, three-customer progression and two-reset gates remain required.
Focused client/contract and unchanged legacy transport coverage passes locally.
The first full local check caught a catalog-registration omission; the new
message resource now joins the existing Platform catalog and its synchronized
DE/EN referenced-key assertions remain unchanged. The renewed local check passed912 tests. CI40131764420 passed both protected
browser engines; ordinary Chromium passed316 cases but failed the new callback
landing because Playwright does not intercept redirected destinations. The
fixture now uses the existing loopback TLS server for the genuine303 landing,
retaining different-site provider isolation, cookie and exact-request assertions.
The corrected source and updated immutable API pair require renewed full gates. Local browser execution could not
start because engines are absent and their download was unavailable; no browser
success is claimed from that attempt.

Browser progression uses isolated provider/HTTP fixtures and real browser
cross-site cookie/COOP behavior. It does not prove real Microsoft signatures or
physical MFA. The backend's native operation progression separately uses actual
PostgreSQL session/audit/transaction repositories and isolated MSAL responses.
Neither is deployed acceptance. Synthetic Microsoft handoff/Calendar custody,
owner REAL Customer entry, sole-owner lifecycle, audited old-key retirement,
actual provider settings and coordinated live verification remain release work.


CI40132834167 verified ordinary Chromium and both protected engines, then ordinary
WebKit rejected Playwright's fulfilled303 response. The callback now continues
to the existing real loopback HTTPS server as well as its landing; both engines
must exercise the actual redirect. No redirect/cookie/COOP assertion is removed.
The final immutable API pin is387654a132ef4fd02c122021aeac706574a3ff20.
This correction requires renewed full browser/paired qualification.


CI40134642318 reached the actual WebKit callback/landing but its cookie assertion
used Playwright request.headers(), whose documented projection excludes security
and cookie headers. Callback/write evidence now uses request.allHeaders() in both
engines. All actual Lax/Strict presence/absence assertions remain unchanged.
The failed WebKit run remains historical; renewed browser gates are required.


CI40135928573 passed ordinary Chromium, both protected engines and316 other
WebKit cases. WebKit still omitted Cookie from the intercepted final request's
allHeaders() metadata. The next fixture continues that actual browser request to
the loopback TLS server. The receiver requires the exact normal Strict cookie,
operation Strict cookie, source CSRF, proof state and bounded original command
before returning its fixed success receipt. Its actual callback receiver also
requires the Lax transaction cookie and rejects either Strict cookie. Browser
assertions require both closed receipts; raw cookies are never echoed. Negative
receiver tests prove missing/wrong cookies, CSRF, proof, origin, changed command
and oversized body produce no receipt. No cookie policy, COOP, timeout, retry or
application behavior changes. These stronger receiver observations require fresh
full browser gates; the prior failure is retained and no browser success is
inferred from the local receiver tests.

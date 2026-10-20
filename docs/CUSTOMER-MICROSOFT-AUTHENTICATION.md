# Invited Customer Microsoft authentication presentation

The registered `customer.microsoft-authentication` flag defaults OFF. Production
composition passes that explicit flag to the existing invited-Customer bootstrap;
the closed Customer/Platform Demo graphs cannot import these authentication
modules. Shell injection of account/pending-authentication presentation into the
closed Demo is also rejected. This preparation does not change a backend resolver,
activate a provider or authorize an identity, membership, role or account link.

## Ownership and continuations

The existing Customer authentication controller/view own email-code entry and
explicit organization choice. The controller can also read the independently
verified Microsoft membership-choice ceremony. A fixed callback query is only a
presentation hint: the server's browser-bound HttpOnly transaction cookie and
current accepted membership must still authorize every read and mutation. An
unknown Microsoft identity offers invited-email recovery and explicit profile
linking; an email claim never merges accounts or creates authority in the browser.

The shell composes a pending view through an explicit authentication presentation
port. This also handles a callback when an older ordinary session still exists;
the new membership selection is not silently skipped. Profile account controls
are a separate view/controller owned by Customer authentication. They read only
the server's minimized Microsoft-linked/fresh-email-required booleans. Unknown
state cannot enable a link action. The server remains authoritative even if a
caller bypasses or changes any presentation state.

Link start requires the ordinary current session's CSRF proof. Microsoft confirms
the account first; the callback then reads the separate flow confirmation proof.
Only an explicit user confirmation posts `confirm:true` with that flow's CSRF.
Older sessions are invalidated by the backend's atomic security-version change.
The client verifies the resulting ordinary session before leaving the ceremony.
A stale or Microsoft-only session instead offers an explicit sign-out/email-code
reauthentication action; no code is requested or mail sent automatically.

An ambiguous selection/confirmation response is never blindly replayed. Selection
offers ordinary session verification; linking independently reads current account
state or requires reauthentication. A current linked-state read describes that
current account, not an inferred success of an unknown previous command. Closing
the profile disposes its view/proof state and preserves the existing application
view; completing a link refreshes the application authority through normal reload.

## Transport, privacy and accessibility

The email and Microsoft clients share a fixed-operation, same-origin HTTPS
transport. It retains credentials on the same origin, rejects redirects/foreign
response URLs, uses no-store/no-referrer and has one bounded deadline and no retry.
The two CSRF kinds remain separate, held only in private memory. Clear/dispose
invalidates late responses so they cannot rearm a retired flow proof. Neither
browser storage nor URL parameters receive a code, nonce, provider token, session
ID or proof. Microsoft navigation accepts only the fixed organizational endpoint;
Customer Tenant selection, roles and user identity cannot be supplied as authority.

Native forms/buttons, explicit labels, live status/error text, focus restoration
and the existing card/button-row design are reused. All new text uses central
DE/EN catalogs. The authentication catalog is included in the canonical
duplicate/key/placeholder parity gate. The Tenant audit adapter and view recognize
the new identity-link action with localized labels; raw provider identities and
security versions remain excluded by the server's public history projection.

## Evidence boundary

Client/controller tests cover explicit choice, both CSRF kinds, failed/stale
state, one mutation attempt, ambiguous outcomes, disposal/late response, minimized
history and unchanged email behavior. Browser fixtures use only HTTPS127.0.0.1,
actual production UI modules, synthetic API responses and an injected navigation
recorder; foreign network requests are aborted. The deployment flag stays OFF.
These fixtures do not contact Microsoft or prove a real provider, mailbox,
passkey, database authorization or protected INT runtime cutover.

The first local full/browser executions overlapped CPU-intensive validation and
hit existing benchmark/CLI/browser deadlines; failures and diagnostic artifacts
are retained. Browser tests now observe the actual document transition before
checking post-login UI, retaining all original authority/request/reflow assertions
and deadlines. The isolated four-case WebKit/iPhone journey passed, including
keyboard, DE/EN,320/1280 and doubled-text reflow. Exact final full checks, Chromium,
paired Demo/native backend acceptance and deployed/manual acceptance must be
reported separately; no formal accessibility or security certification is implied.

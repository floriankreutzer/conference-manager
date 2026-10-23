# INT single-passkey presentation contract

The server-owned passkey configuration supports a minimum of one only when its
validated environment is INT. DEV and PROD retain the two-key response contract;
missing, malformed or foreign reduced minima are rejected. No browser setting
selects the minimum. The API remains authoritative for every proof, session,
registration, independent enrollment grant and recovery action.

Localized setup and management copy no longer assumes two keys for every
configuration. Setup completion never implies business activation. The actual
Apple/iPhone registration, signed possession and independent recovery acceptance
remain operating requirements, not results of mocked browser tests.


## Confidential recipient-window approval files

INT setup offers an optional file delivery path alongside the existing manual
form. Preparing delivery creates a non-exportable RSA4096/SHA256 recipient key
in the current trusted browser window and downloads only its public request.
The request contains no grant, operator identity or approval authority. Expiry
is fifteen minutes; closing/navigating the window discards private custody.
The owner uses their own Safari window, with no separate Admin computer or new
password manager. Microsoft renewal opens a separate tab while this window stays
open. No QR/proximity bridge to a remote cloud browser is assumed.

The separately authorized canonical owner workflow supplies only an encrypted
approval file, with public request/fingerprint references and an opaque binding
hash. Explicit local file selection/submission validates the fixed bounded schema,
recipient, nonce, OAEP label hash and ciphertext before forwarding the decrypted
claim directly to the existing same-origin enrollment endpoint. It never fills
setup-code inputs, displays/exports plaintext, uses clipboard, or stores keys or
grants in localStorage/sessionStorage/IndexedDB. Native passkey creation and signed
possession still require the owner's separate user actions.

The browser never issues or approves a grant and cannot select its operator,
roles, purpose, source, environment or epoch. The backend's independent bootstrap
or recovery authority, current Microsoft primary proof, CSRF/state/cookie and
one-use enrollment contracts remain authoritative. Modified/foreign/stale files,
missing primary proof and ambiguous writes have no automatic retry/fallback.
Keys are discarded on pagehide or terminal enrollment transition. A lost recipient
requires a new independently reconciled issuance, not a reconstructed private key.

Actual iPhone/iCloud custody and recovery remain operating acceptance. Automated
Node/WebCrypto/Chromium/WebKit fixtures use software/test values only. See the API
repository's PLATFORM-PASSKEY-ASSURANCE.md for canonical issuance and exact field
bindings. WebCrypto uses the established RSA-OAEP/SHA256 standard; no new library,
identity provider, password manager, paid plan or backend endpoint is introduced.

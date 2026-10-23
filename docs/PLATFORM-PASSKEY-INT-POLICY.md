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

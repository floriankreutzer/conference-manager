# Production Persistence Contract

Issue #56 establishes the secure browser-side migration boundary from the static demo to trusted SaaS persistence.

The normative migration and rollback rules are documented in `PRODUCTION-PERSISTENCE-MIGRATION.md`.

Key invariants:

- explicit `demo` keeps the existing LocalStorage-compatible MVP;
- missing/unknown runtime mode is production and fails closed;
- profile, role, Requests, catalog, site data, notifications and configuration cannot use LocalStorage as production authority;
- production repositories use only the same-origin API client and versioned response envelopes;
- catalog and Request responses are accepted only in their minimized backend wire shape: required fields and types are validated, unknown fields and duplicate IDs fail closed, catalog room/site references must resolve, and no Tenant/User authority fields are retained;
- production room availability uses the same-origin backend and an authoritative catalog site IANA time zone; missing zones fail closed;
- changing the selected room or UTC window invalidates the browser's prior availability result before request submission;
- API/network/schema failures never fall back to browser persistence;
- language and untrusted local drafts may remain local convenience state;
- existing demo data is never automatically uploaded into a production Tenant;
- any future legacy-data import is a separately audited server-side migration process.

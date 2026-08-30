# Production Persistence Contract

Issue #56 established the secure browser-side migration boundary from the former static Demo to trusted SaaS persistence. ADR-010 subsequently superseded the LocalStorage-authoritative Demo side of that historical boundary.

The normative migration and rollback rules are documented in `PRODUCTION-PERSISTENCE-MIGRATION.md`.

Key invariants:

- explicit `demo` selects the Customer Demo composition and its separate server-issued Demo session/API boundary;
- missing/unknown runtime mode is production and fails closed;
- profile, role, Requests, catalog, site data, notifications, configuration, Tenant/fleet state and effective permissions cannot use LocalStorage as Production or Demo authority;
- production repositories use only the same-origin API client and versioned response envelopes;
- catalog and Request responses are accepted only in their minimized backend wire shape: required fields and types are validated, unknown fields and duplicate IDs fail closed, catalog room/site references must resolve, and no Tenant/User authority fields are retained;
- production room availability uses the same-origin backend and an authoritative catalog site IANA time zone; missing zones fail closed;
- changing the selected room or UTC window invalidates the browser's prior availability result before request submission;
- API/network/session/schema failures never fall back to browser persistence, fixtures or browser mutation rules;
- language and explicitly bounded untrusted local drafts may remain local convenience state;
- Customer and Platform Demo business state is persisted in one isolated PostgreSQL database while their sessions, cookies, CSRF keys, origins, API processes and runtime database roles remain separate;
- persona selection is server-resolved and cannot mint effective roles or permissions in the browser;
- existing demo data is never automatically uploaded into a production Tenant;
- any future legacy-data import is a separately audited server-side migration process.

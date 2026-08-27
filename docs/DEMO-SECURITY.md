# Conference Manager Demo Security Model

## Scope

This repository hosts a static browser demo. It has no backend, no real identity provider and no server-side authorization. The role switch is a demo control only. It exposes three isolated presentation perspectives: Employee, Conference Manager and Tenant Admin. Selecting Tenant Admin does not grant Conference Manager capabilities and does not represent a production permission assignment.

Requests, profile information, catalog changes and notifications are stored locally in the current browser profile. The Tenant Admin user list and role assignments shown in the demo are separate in-memory example data for the current page lifecycle; they are not uploaded, persisted as production authority or treated as identity evidence.

The demo must therefore not be presented as an authenticated production application and must not be used for real confidential, personal or regulated data.

## Security controls implemented for the demo

- Content Security Policy (CSP) restricts scripts and images to the application origin, permits deterministic inline image data, blocks plugins/objects and network connections, and prevents base-URL manipulation. Catering illustrations and the baseline route QR code are generated or served locally; the demo does not contact an external image or QR service automatically. Conference Manager image fields accept only bounded managed paths under `assets/` or constrained inline SVG data and reject cross-origin sources before browser-local persistence.
- Referrer policy is `no-referrer`.
- Application rendering uses DOM APIs and `textContent`; direct `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `document.write` and Function constructors are blocked by the static quality gate.
- DOM helper code rejects inline event-handler attributes and `srcdoc`.
- External navigation helpers accept HTTPS URLs only; same-origin HTTP is allowed only for local development/test navigation.
- Browser storage has per-key size limits, rejects malformed/oversized values and removes prototype-pollution keys before data reaches the application model.
- Demo role and language values are allow-listed. Unknown demo roles fail back to Employee.
- The Tenant Admin demo adapter accepts only `conference_manager` and `tenant_admin` as elevated example roles, blocks self-role changes, rejects privilege additions to inactive example users and never exposes `platform_admin`.
- Demo Tenant Admin state is isolated from the production session/API adapters and has no network transport or direct browser-storage authority.
- External route links require deliberate user navigation. Their target is not fetched to render the Demo or its print view.
- Text inputs and free-text areas receive bounded lengths; participant fields are constrained to realistic demo values.
- A visible Demo Mode notice explains that there is no SSO or server-side authorization and that data remains in the browser.
- Users can clear all `conference_*` local/session demo data from the UI.
- CI includes syntax tests, SAST-style defensive checks, secret scanning, dependency audit, domain/unit regression tests and Playwright E2E tests on Chromium desktop and WebKit/iPhone profile.
- GitHub Actions are pinned to commit SHAs and Dependabot checks npm and Actions dependencies weekly.

## Controls intentionally not simulated

The following controls require a real backend or identity platform and are therefore out of scope for this demo:

- SSO / MFA / identity lifecycle
- server-side authentication and authorization / RBAC enforcement
- secure server sessions, token validation and logout invalidation
- CSRF protection for state-changing server requests
- SQL injection protection and database access controls
- SSRF controls for server-side outbound requests
- rate limiting and abuse protection
- centralized audit logging and tamper-resistant evidence
- server-side encryption, retention and deletion controls
- productive e-mail, Teams or calendar integrations

Adding fake client-side equivalents would create security theatre and must not be described as production protection. The Tenant Admin demo therefore exercises UI behavior and negative client-side contracts only; production authorization, audit and session invalidation remain backend responsibilities.

## Production security delta

Before a production rollout, introduce a backend/BFF and identity integration. Enforce authorization on every protected operation server-side, validate all input at the trust boundary, use secure session/token handling, configure HTTP security headers at the hosting layer, remove demo role switching, replace browser-only storage with controlled persistence, add centralized audit logging, implement real notification/calendar adapters and run SAST/SCA/DAST plus penetration testing against the deployed system.

## Verification

The security regression suite covers at least:

1. malformed and oversized local storage;
2. prototype-pollution keys in stored JSON;
3. XSS payloads stored in request text;
4. CSP/referrer-policy presence;
5. explicit Demo Mode disclosure and the isolated Employee / Conference Manager / Tenant Admin role switch;
6. Tenant Admin self-change, inactive-user and unknown-role rejection in demo data;
7. demo-data deletion;
8. input bounds;
9. dependency and secret scanning;
10. existing happy/negative workflows on Chromium and WebKit.

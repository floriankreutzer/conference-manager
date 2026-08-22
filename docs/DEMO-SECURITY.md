# Conference Manager Demo Security Model

## Scope

This repository hosts a static browser demo. It has no backend, no real identity provider and no server-side authorization. The role switch is a demo control only. All requests, profile information, catalog changes and notifications are stored locally in the current browser profile.

The demo must therefore not be presented as an authenticated production application and must not be used for real confidential, personal or regulated data.

## Security controls implemented for the demo

- Content Security Policy (CSP) restricts scripts to the application origin, blocks plugins/objects and network connections, restricts images to the known demo sources and prevents base-URL manipulation.
- Referrer policy is `no-referrer`.
- Application rendering uses DOM APIs and `textContent`; direct `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `document.write` and Function constructors are blocked by the static quality gate.
- DOM helper code rejects inline event-handler attributes and `srcdoc`.
- External navigation helpers accept HTTPS URLs only; same-origin HTTP is allowed only for local development/test navigation.
- Browser storage has per-key size limits, rejects malformed/oversized values and removes prototype-pollution keys before data reaches the application model.
- Demo role and language values are allow-listed.
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

Adding fake client-side equivalents would create security theatre and must not be described as production protection.

## Production security delta

Before a production rollout, introduce a backend/BFF and identity integration. Enforce authorization on every protected operation server-side, validate all input at the trust boundary, use secure session/token handling, configure HTTP security headers at the hosting layer, remove demo role switching, replace browser-only storage with controlled persistence, add centralized audit logging, implement real notification/calendar adapters and run SAST/SCA/DAST plus penetration testing against the deployed system.

## Verification

The security regression suite covers at least:

1. malformed and oversized local storage;
2. prototype-pollution keys in stored JSON;
3. XSS payloads stored in request text;
4. CSP/referrer-policy presence;
5. explicit Demo Mode disclosure;
6. demo-data deletion;
7. input bounds;
8. dependency and secret scanning;
9. existing happy/negative workflows on Chromium and WebKit.

# Conference Manager Demo Security Model

## Scope

This repository owns the Customer browser artifact for the shared server-backed Demo. The operational Demo uses a dedicated Customer Demo API process and one isolated PostgreSQL Demo database shared with the separately authenticated Platform Demo. It has no real identity provider and is not a Production authorization boundary. The Tenant and persona selectors submit allowlisted intent only; the Demo server issues the effective synthetic Principal, roles and permissions. Selecting Tenant Admin does not grant Conference Manager capabilities.

Requests, profile information, catalogue changes, notifications, Tenant settings and role changes are server-backed Demo state. LocalStorage and sessionStorage are not business authorities. A missing or invalid API/session/schema renders the Demo unavailable and never activates browser fixtures or historical browser repositories.

The GitHub Pages URL remains a static fail-closed compatibility surface for the scheduled ZAP baseline. Because Pages cannot host the same-origin API process, it displays the explicit unavailable state rather than pretending to be the operational shared Demo. Functional Demo acceptance and DAST require the separately deployed shared Demo origin.

The demo must therefore not be presented as an authenticated production application and must not be used for real confidential, personal or regulated data.

## Security controls implemented for the demo

- Content Security Policy (CSP) restricts scripts, images and API connections to the application origin, permits deterministic inline image data, blocks plugins/objects and cross-origin API access, and prevents base-URL manipulation.
- Referrer policy is `no-referrer`.
- Application rendering uses DOM APIs and `textContent`; direct `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `document.write` and Function constructors are blocked by the static quality gate.
- DOM helper code rejects inline event-handler attributes and `srcdoc`.
- External navigation helpers accept HTTPS URLs only; same-origin HTTP is allowed only for local development/test navigation.
- Only the selected language may remain as a bounded, non-authoritative browser preference.
- Demo Tenant and persona values are allowlisted by the browser contract and independently resolved and authorized by the Demo server.
- Customer Demo sessions, cookies, CSRF state, routes and database role remain separate from the Platform Demo boundary.
- External route links require deliberate user navigation. Their target is not fetched to render the Demo or its print view.
- Text inputs and free-text areas receive bounded lengths; participant fields are constrained to realistic demo values.
- A visible Demo notice identifies synthetic server-backed data and never presents the session as Production identity.
- CI includes syntax tests, SAST-style defensive checks, secret scanning, dependency audit, domain/unit regression tests and Playwright E2E tests on Chromium desktop and WebKit/iPhone profile.
- GitHub Actions are pinned to commit SHAs and Dependabot checks npm and Actions dependencies weekly.

## Controls intentionally not simulated

The following controls require a real backend or identity platform and are therefore out of scope for this demo:

- SSO / MFA / identity lifecycle
- real Production authentication, Conditional Access and authorization evidence
- Production session, token and logout-invalidation evidence
- Production CSRF and edge-security evidence
- Production database grant and injection-test evidence
- SSRF controls for server-side outbound requests
- rate limiting and abuse protection
- centralized audit logging and tamper-resistant evidence
- server-side encryption, retention and deletion controls
- productive e-mail, Teams or calendar integrations

The shared Demo implements these concerns only for deterministic synthetic scenarios. Treating its controls as Production evidence would create security theatre. Production authorization, audit, session invalidation, infrastructure and provider acceptance remain separate requirements.

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

# Pavurel INT application domain cutover

Tracking: [shared issue #415](https://github.com/floriankreutzer/conference-manager/issues/415), **SaaS1**.

## Scope and status

The selected target is a coordinated domain change for the existing protected
INT Customer and Platform applications. This document and its regression tests
prepare that change; they do not establish a live deployment, successful login,
mail delivery or operating acceptance. The two source pull requests must be
reviewed together with their exact immutable frontend/API counterparts.

| Surface | Selected INT origin | Same-origin API namespace |
| --- | --- | --- |
| Customer | `https://app.int.pavurel.eu` | `/api/v1/` |
| Platform | `https://platform.int.pavurel.eu` | `/api/v1/platform/` |

Both browser artifacts and both backend processes remain separate. A shared
parent domain does not merge sessions, cookies, CSRF state, principals, roles or
authorization. Keep the existing host-only cookie scope and exact server-side
Host/Origin checks. API requests remain relative to their own application;
there is no new cross-origin API host or wildcard CORS policy.

Future DEV names are `app.dev.pavurel.eu` and `platform.dev.pavurel.eu`.
Future PROD names are `app.pavurel.eu` and `platform.pavurel.eu`. These names are
planning only. They require their own isolated resources, credentials, data and
release evidence; changing the hostname must never relabel INT as DEV or PROD.

## Existing frontend build contract

The existing `scripts/build-protected-frontend.mjs` already accepts the selected
origins. No additional runtime profile, client-side routing rule or hostname
fallback is introduced. Run it from an exact clean reviewed frontend checkout
after the locked dependency installation, with a new absolute output directory.

| Build input | Required selection for this INT release |
| --- | --- |
| `PROTECTED_ENVIRONMENT` | `int` |
| `PROTECTED_CUSTOMER_ORIGIN` | `https://app.int.pavurel.eu` |
| `PROTECTED_PLATFORM_ORIGIN` | `https://platform.int.pavurel.eu` |
| `PROTECTED_API_COMMIT` | Exact accepted 40-character API commit SHA |
| `PROTECTED_FRONTEND_COMMIT` | Exact accepted 40-character frontend SHA matching checkout HEAD |
| `PROTECTED_SYNTHETIC_ENABLED` | `true` for the existing INT scenarios |
| `PROTECTED_PRESENTATION_MICROSOFT_ENABLED` | `true` |
| `PROTECTED_PRESENTATION_INVITATIONS_ENABLED` | `true` |
| `PROTECTED_OWNER_CUSTOMER_ACCESS_ENABLED` | `true` for the existing approved owner-access presentation |

Invoke `node scripts/build-protected-frontend.mjs /absolute/new-artifact-directory`
with these nonsecret build inputs. Never substitute branch names, mutable refs,
placeholder SHAs or a previously generated manifest digest for reviewed values.
The CLI requires a clean checkout and checks the actual frontend HEAD.

Each manifest binds both origins, the environment, source pair, presentation
flags and all file paths, lengths and digests. The generated Customer form policy
allows only itself and the exact Platform counterpart; the Platform form policy
allows only itself and the exact Customer counterpart. Both retain
`connect-src 'self'`. The approved server-owned handoff contract remains the
authority for any cross-surface navigation or form operation.

Configure each API process with the corresponding newly generated manifest pin
and the same selected origins. Old-domain artifact pins cannot be reused. Keep
build-only presentation inputs out of protected runtime configuration, where
unknown `PROTECTED_` keys are rejected. The browser metadata grants no identity,
Tenant, role, provider or application authority.

## Identity and provider coordination

The approved authentication target is **Platform Microsoft with independently
verified Microsoft MFA, without application-managed passkeys**, and **Customer
Microsoft or invitation-bound email code**. The API owns this contract in
[MICROSOFT-MFA-CUTOVER.md](https://github.com/floriankreutzer/conference-manager-api/blob/main/docs/MICROSOFT-MFA-CUTOVER.md).
A domain change does not authorize a legacy passkey enrollment flow, provider
claim fallback, role change or weaker session policy.

The identity owner must qualify the exact new callback URIs in the appropriate
existing Microsoft application registration:

| Purpose | Exact target callback URI |
| --- | --- |
| Customer Microsoft login | `https://app.int.pavurel.eu/api/v1/auth/microsoft/callback` |
| Platform Microsoft login | `https://platform.int.pavurel.eu/api/v1/platform/auth/microsoft/callback` |
| Platform fresh-operation authentication | `https://platform.int.pavurel.eu/api/v1/platform/auth/microsoft/operation/callback` |
| Customer Microsoft 365 admin consent, when enabled | `https://app.int.pavurel.eu/api/v1/integrations/microsoft365/callback` |

The conditional integration callback does not enable that integration or replace
its separately required real-provider acceptance. Keep old registrations and
configuration in the bounded rollback record until the new source pair has
passed its actual login and operation acceptance. Never use wildcard or
parent-domain callback allowances.

Render's [HTTP health-check contract](https://render.com/docs/health-checks)
uses one verified custom domain as the `Host` header when a service has such a
domain. The API checks its configured Host before the health route. Therefore,
adding or verifying a provider domain must be coordinated with the matching
runtime origins, manifests, callbacks and readiness observations. Do not attach
the new domains to an old-origin process as a supposedly passive preparation,
and do not weaken Host/Origin checks or switch off HTTP readiness to make a
provider deployment succeed.

The paired API [domain cutover runbook](https://github.com/floriankreutzer/conference-manager-api/blob/main/docs/PAVUREL-INT-DOMAIN-CUTOVER.md)
owns the actual two-process cutover, selected immutable source pair, runtime
configuration and observations. Historical Demo Blueprints,
old password/perimeter acceptance utilities, reset fixtures and prior DAST
evidence are separate contracts; do not mechanically replace every Render URL
or re-target those tools at the protected INT applications.

## Qualification and rollback

Source verification includes `npm run check`, `npm run audit` and the existing
required frontend/API CI gates. `tests/protected-int-domains.test.js` builds both
real artifact inventories, checks their read-back seals and exact domain/CSP
bindings, preserves separate API credentials, and exercises malformed and
sibling-origin rejection. It performs no network request to either live app.
These tests do not prove DNS, TLS, browser cookie isolation, Microsoft MFA or
external email delivery.

Before declaring operating acceptance, retain evidence for:

1. Both provider domains and TLS, with the selected Host reaching the correct
   process and its unchanged HTTP dependency-readiness route.
2. Both actual immutable deployment identities, newly sealed frontend manifests,
   exact runtime origins and correctly targeted runtime observations.
3. Customer Microsoft and email-code access; Platform successful verified MFA
   and rejected non-MFA access; fresh-operation callbacks, logout and expired or
   foreign session denial.
4. Separate host-only sessions and exact Origin/CSRF enforcement even though the
   two new hosts share the same registrable parent domain.
5. The permanent Northwind, Contoso and Fabrikam progression/reset contract in
   both supported browser engines against the exact frontend/API pair.

The rollback unit is the complete previously accepted pair with its original
origins, matching artifacts, provider routing/healthcheck host, callbacks and
observation configuration. Preserve the recorded compatible schema/data and
security-epoch constraints; never restore obsolete authority, bypass guards or
infer successful rollback from a certificate or a running process alone.
Actual cutover and rollback records belong to the protected operating evidence;
this public guide contains no credentials, private receipts or customer data.

## Related contracts

- [Immutable protected hosting artifacts](PROTECTED-HOSTED-FRONTEND.md)
- [Production topology](SAAS-PRODUCTION-TOPOLOGY.md)
- [Current and planned application addresses](DEMO-URLS.md)
- [API protected frontend contract](https://github.com/floriankreutzer/conference-manager-api/blob/main/docs/PROTECTED-HOSTED-FRONTEND.md)
- [Cross-repository test strategy](https://github.com/floriankreutzer/conference-manager-api/blob/main/docs/TEST-STRATEGY.md)

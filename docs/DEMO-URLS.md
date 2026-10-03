# Canonical Demo URL Index

## Topology

The Demo has one public static launch surface and two separately hosted application origins.

| Surface | Canonical URL | Responsibility |
| --- | --- | --- |
| Public website launchpad | `https://floriankreutzer.github.io/conference-manager-website/en/demo/` | Static human navigation only, owned by `conference-manager-website`; no authentication, session, API, persistence, reset or Tenant authority. |
| Customer Demo | `https://conference-manager-demo.onrender.com` | Customer Employee / Conference Manager / Tenant Admin / dual-role Demo application and same-origin Customer Demo API. |
| Platform Demo | `https://conference-manager-ops-demo.onrender.com` | Separate Platform Operator Demo application and same-origin Platform Demo API. |

The German launch route is `https://floriankreutzer.github.io/conference-manager-website/de/demo/`.

## Trust boundary

The public website launchpad is not an application host or trust boundary for Conference Manager. It remains a static navigation surface linking directly to the canonical Render origins.

It MUST NOT:
- proxy or call Customer or Platform APIs;
- store or forward session cookies, CSRF tokens, identities, Tenant IDs, roles or permissions;
- expose Demo reset/reseed endpoints;
- embed the Customer or Platform applications in frames;
- contain provider credentials or deployment secrets;
- implement a local role/persona selector;
- fall back to browser fixtures or local persistence.

Customer and Platform Render origins remain separate security domains with separate browser sessions, CSRF state, application processes and database roles even though their Demo business state uses the shared isolated Demo PostgreSQL model.

## Cold start

The launchpad warns that Render Free services can be sleeping. Initial navigation may need additional startup time. A sleeping or unavailable Demo service must fail unavailable rather than causing the browser or public website to synthesize application authority.

## Review source

The public launch implementation, bilingual copy, fixed HTTPS destinations and accessibility regression tests are owned by `conference-manager-website`. This private-target application repository no longer contains or publishes a duplicate launchpad.

## External acceptance

Hosted application acceptance is performed against the two Render application origins. The static launchpad is independently scanned at its website-owned URL. Application acceptance verifies deployed build identity, readiness, shared business state, cross-Tenant isolation, role boundaries, CSRF behavior and deterministic reset/reseed behavior on the Render services.

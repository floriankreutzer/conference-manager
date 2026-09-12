# Conference Manager Demo Security Model

## Scope

This repository owns the Customer browser artifact for the shared server-backed Demo and the separate static GitHub Pages Demo launchpad. The operational Demo uses a dedicated Customer Demo API process and one isolated PostgreSQL Demo model shared with the separately authenticated Platform Demo. It has no real identity provider and is not Production authorization evidence.

The Customer Tenant/persona selector submits allowlisted context intent only. The Demo server issues the effective synthetic Principal, roles and permissions. Every active Customer persona includes the Employee baseline. Conference Manager and Tenant Admin are independent elevated roles; `dual_role` is the exact derived union and is not an additional persisted authorization role.

Requests, profile information, Room business data, Catalogue/Room prices, notifications, Tenant settings and role changes are server-backed Demo state. LocalStorage and sessionStorage are not business authorities. A missing or invalid API/session/schema renders the Demo unavailable and never activates browser fixtures or historical browser repositories.

## GitHub Pages launchpad

`https://floriankreutzer.github.io/conference-manager/` is the static Demo launchpad published from `demo-portal/`.

The Pages surface:

- links directly to the Customer Render origin `https://conference-manager-demo.onrender.com`;
- links directly to the Platform Render origin `https://conference-manager-ops-demo.onrender.com`;
- contains no application JavaScript, session handling, API proxy, role selector, reset function or browser persistence;
- carries a fail-closed meta CSP for resources, forms, objects and base-URL changes;
- carries no Tenant/User/role/permission/CSRF/provider authority;
- warns about Render Free cold-start behavior;
- is the target of the static-launchpad entry in the scheduled three-surface ZAP baseline matrix;
  the Customer and Platform Render origins are separate entries with separate results.

Functional Demo acceptance and runtime security validation belong to the separately deployed Render origins and the PostgreSQL-backed shared-Demo browser journey. A clean ZAP scan of the Pages launchpad is not evidence for Customer or Platform application authorization, and a clean passive scan of either Render origin is not authenticated authorization/API or Production penetration evidence.

GitHub Pages does not expose repository-controlled response-header configuration. The launchpad
therefore delivers its resource/form/base restrictions through an HTML meta CSP. CSP
`frame-ancestors` is not valid in a meta-delivered policy, so this repository does not claim that the
launchpad has response-header clickjacking protection. That provider-controlled response-header
posture must be verified separately in deployed acceptance and must not be inferred from the meta
policy.

The scheduled/manual ZAP workflow first requires a direct HTTP `200` from the Pages launchpad or the
surface-specific Customer/Platform readiness endpoint, so a Render Free cold start cannot be
mistaken for a scan result. The repository generates the exact Automation Framework plan before
starting ZAP and scopes both context and spider to the reviewed target URL rather than broadening a
path target to its origin root. Its `INFO` compatibility map contains exactly the unsuffixed plugin IDs derived from
each surface's exact policy. Every exact-policy row encodes one canonical HTTPS URL; repeated alert
references enumerate distinct reviewed URLs. Each map URL expression must equal the
repository-generated finite union of those exact URLs byte for byte. The compatibility map does not
filter or rewrite the report.
An always-run repository validator independently requires the fresh raw report, exact HTTPS target
metadata and an unfiltered instance for every finding, then binds each instance to one reviewed
alert reference, URL, method and maximum risk. Policy URLs and report instances must remain inside
the canonical target subtree; same-origin root, robots, sitemap or sibling paths are rejected. It
also binds the generated Automation Framework
environment, target subtree, scan/wait parameters, ordered summary rules and three post-scan report
targets. Before the third-party container starts, the workflow recreates and path-verifies the
isolated evidence mount. The
projection's plugin set and URL patterns must be an exact derivation of the alert-reference policy.
The third-party scanner container receives only a dedicated plan/report directory, never the
checked-out repository tree. In the same container home, the runner preserves the official
baseline `-a` behavior by installing both `pscanrulesBeta` and `pscanrulesAlpha`, records ZAP's
installed-add-on manifest, and fails before scanning unless each rule set is present with its
expected release status. Rules `90004` and `90005` are explicitly enabled in the validated plan.

An unknown plugin, new sibling alert reference, changed URL, risk escalation, filtered finding or
wrong-origin or out-of-target-subtree report remains validator-blocking even when its base plugin appears in the
compatibility projection. The four
exact `90005-*` alert references are URL-scoped because ZAP's crawler, unlike a browser, does not
send the `Sec-Fetch-Dest`, `Sec-Fetch-Mode`, `Sec-Fetch-Site` or `Sec-Fetch-User` request headers
that the rules inspect. Broad plugin dispositions in the exact policy, `IGNORE`, wildcard
exclusions and warning-tolerant execution are prohibited.

This is a bounded passive-baseline control: its repository-generated plan uses a one-minute spider,
but configures `maxAlertsPerRule: 0` so ZAP retains unlimited alert evidence for the exact verifier.
It is useful repeatable regression evidence, but it is not an exhaustive crawl, authenticated API
authorization test or penetration test.

The Pages policy is limited to cache behavior, response-header controls that GitHub Pages cannot
configure, public-static CORS and GitHub account-root `404`/base64 observations. Its exact
`10050-1` and `10050-2` entries distinguish an observed `X-Cache: HIT` from an observed valid
`Age` header; both remain restricted to the enumerated public-static URLs. The Render policies
classify the public shell/static `no-cache` behavior and the equivalent header-plus-meta CSP only at
the exact observed URLs. API responses retain `no-store`; both Render shells require the tested
cross-origin isolation headers. Cookie, anti-CSRF, CSP-absence, mixed-content, vulnerable-library,
information-disclosure and authentication findings remain blocking. These evidence-reviewed
false-positive classifications are not permission to suppress a changed path or new scanner rule.

The Demo must not be presented as an authenticated Production application and must not be used for real confidential, personal or regulated data.

## Role and ownership boundary

The server-enforced Demo role contract mirrors the Production Tenant policy:

- Employee: own Request read/cancel; no physical Request deletion.
- Conference Manager: Tenant-wide Request operations, including supported self-approval; Room business data; Tenant Catalogue; authoritative Room prices.
- Tenant Admin: Organization, Booking Policy, Cost Allocation, Sites/technical Room assignment, Tenant Users/elevated roles, provider integrations/mappings and Tenant audit administration.
- Dual role: exact union of all three capability sets.

Provider Room identity/resource mapping remains Tenant Admin-owned. Room business fields and Catalogue/Room prices remain Conference Manager-owned. A mixed technical/business Location mutation requires both elevated capability sets and is reclassified by the API against the persisted authoritative snapshot.

## Security controls implemented for Demo

- Customer and Platform Demo use separate origins, processes, session cookies, CSRF state and least-privilege database roles.
- Tenant scope and effective roles/permissions are server-derived; browser DOM, URL and storage values cannot establish authority.
- Content Security Policy restricts the Customer Demo artifact to same-origin scripts/API, deterministic inline image data and no plugin/object/base manipulation.
- Referrer policy is `no-referrer`.
- Application rendering uses safe DOM APIs; executable HTML sinks and dynamic-code primitives are blocked by repository gates.
- Only bounded non-authoritative preferences such as language may remain browser-local.
- Customer context changes rotate/re-establish a server-issued Demo session; persona/role/permission mismatch fails closed in the frontend contract.
- Production-style `security_version` semantics invalidate stale privileges after role changes.
- Customer inactivity lock is additive defense in depth: Demo locks after five minutes, clears sensitive UI and revalidates the authoritative server session before unlock.
- Cross-tab communication can propagate only a lock event, never an unlock or permission grant.
- External/provider behavior is deterministic and synthetic; no real Microsoft Graph/IdP call is required for the shared Demo baseline.
- CI includes syntax/architecture/SAST-style checks, secret scanning, dependency audit/review, Node regression tests and Chromium/WebKit browser tests.
- Shared-Demo CI provisions isolated PostgreSQL roles and starts separate Customer/Platform API processes against one deterministic synthetic database.
- GitHub Actions used for deployment/security gates are pinned according to repository policy.

## Controls intentionally not claimed as Production evidence

The shared Demo does not establish:

- real workforce/customer SSO, MFA or identity lifecycle evidence;
- Production Conditional Access or identity-provider acceptance;
- Production edge/TLS/header deployment evidence;
- Production database grants/backup/retention/deletion evidence;
- real Microsoft 365/Graph acceptance;
- penetration-test evidence;
- productive e-mail/Teams/calendar operations.

The Demo may implement analogous server controls for synthetic scenarios, but those controls must not be relabeled as Production/provider/penetration acceptance.

## Reset/reseed boundary

Reset/reseed is a Demo-only server operation protected by Demo composition, authorization/CSRF for HTTP access and database locking. It restores only canonical synthetic Demo state, invalidates affected Demo sessions and returns deterministic seed evidence.

The GitHub Pages launchpad cannot call or expose reset/reseed. Production artifacts do not contain the Demo reset route/runtime.

## Outage behavior

If a Render Demo service is sleeping, the Pages launchpad remains static and only navigates to that origin. It does not manufacture a local application fallback.

If the Customer Demo API/session/schema becomes unavailable, the Customer browser fails unavailable. It does not restore previously rendered role authority from LocalStorage, fixtures or the Pages site.

## Verification

The SaaS 3.6 security regression baseline covers at least:

1. canonical Employee/Conference Manager/Tenant Admin/dual-role session projection;
2. unknown role/permission and persona mismatch fail-close behavior;
3. cross-Tenant Request, Location, Catalogue and Tenant-administration denial/concealment;
4. Conference Manager versus Tenant Admin field/domain ownership;
5. Catalogue and authoritative Room-price ownership;
6. CSRF on state-changing cookie-authenticated routes;
7. role-change session invalidation through `security_version`;
8. inactivity timeout, background/BFCache elapsed-time and cross-tab lock behavior;
9. malformed/unknown-field exact-contract rejection;
10. Demo outage/no-local-fallback behavior;
11. deterministic reset/reseed and separate Customer/Platform session domains;
12. dependency, secret and static security gates;
13. Chromium and WebKit shared-Demo journeys against compatible immutable frontend/API refs;
14. static Pages launchpad checks proving no browser/application authority.

See `docs/ROLE-MODEL.md`, `docs/SAAS-3.6-SECURITY-REGRESSION.md`, `docs/DEMO-RUNBOOK.md`, `docs/DEMO-URLS.md` and `docs/PRODUCTION-SECURITY.md` for the coordinated baseline.

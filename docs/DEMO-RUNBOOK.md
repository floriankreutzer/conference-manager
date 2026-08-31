# Conference Manager Demo Runbook

## Purpose and status

This runbook describes the deterministic, server-backed Customer Demo introduced by SaaS 3.5. It is an operating aid, not Production or real-provider acceptance evidence. Use example data only.

The browser declares `conference-runtime=demo` and `conference-demo-data=synthetic-server-backed`. It calls the Customer Demo API on the same Customer Demo origin. A separate Customer Demo process issues the Customer session and accesses the isolated shared Demo PostgreSQL database with a least-privilege customer role.

The Tenant and persona selectors are request controls, not authorization controls. The browser sends an allowlisted context choice; the server resolves the fixture User, Tenant, roles and permissions and returns a minimized effective session. Customer Demo cookies, CSRF state and Principals are separate from the Platform Demo boundary.

## Deterministic baseline

After the documented backend reset/reseed operation, the complete shared Demo baseline is recreated:

The effective presentation is Conference Manager, German, EUR and the code-shipped PAVUREL product-default signet.

| Surface | Baseline | Lifetime |
| --- | --- | --- |
| Language | A valid selected language may remain as a non-authoritative preference. German is the fallback when no valid preference exists. | Browser-local preference |
| Customer context | A seeded Tenant and Employee persona are returned by the Customer Demo session service. | Server session |
| Customer Tenants | At least two stable, isolated Tenants with distinct Users, roles, lifecycle/readiness and business state. | Shared Demo PostgreSQL |
| Profile and Employee data | Deterministic fixture profile, catalogue, Sites/Rooms, Requests, history and notifications. | Shared Demo PostgreSQL |
| Tenant settings and presentation | Deterministic Organization, Locations, Catalogue, Booking Policies and Cost Allocation revisions, including the code-shipped PAVUREL product-default signet. | Shared Demo PostgreSQL |
| Integration simulation | Deterministic provider-neutral success and failure scenarios; no real Microsoft Graph or identity-provider calls. | Demo provider adapter and PostgreSQL |
| Tenant users, audit and readiness | Deterministic fixture identities and server-owned Tenant/audit/readiness projections. | Shared Demo PostgreSQL |
| Images and route code | Catering art is deterministic inline SVG. The baseline OpenStreetMap QR code is a repository-owned asset. Conference Manager image edits accept only bounded managed `assets/` paths or constrained inline SVG data; cross-origin sources are rejected before save. No external image or QR service is contacted automatically. | Repository-owned |

The Demo reuses canonical Customer application services and repository contracts. A shared database does not combine the Customer and Platform trust domains or authorize either process to use the other's session, cookie, CSRF state, routes or database role.

## Reset and reseed

1. Use the documented `conference-manager-api` Demo reset command, or the authenticated Platform Demo reset control.
2. Supply the exact expected seed version when using the command-line reset.
3. Wait for the reset to complete and record the returned seed version and checksum.
4. Reload the Customer Demo. The prior Demo sessions have been invalidated, so a fresh Customer session is established.
5. Verify the seeded Tenant and Employee persona, then inspect the deterministic catalogue, Site/Room and Request baseline.
6. Select Tenant Admin through the Demo context control and verify the seeded settings, Users, integration simulation, audit and readiness state.
7. Open the Platform Demo separately and verify that it observes the same canonical Tenant identifiers and reset baseline through its own session.

Reset is a backend operation protected by Demo-only composition, authorization, CSRF when exposed through HTTP, and a database-level transaction-scoped exclusive advisory lock. It atomically clears mutable Demo state, reseeds canonical rows and projections, records the reset audit event, advances session invalidation state and returns the deterministic seed version/checksum. Production artifacts and route registries do not contain the reset implementation.

## Current usable baseline scenarios

- Employee: create and submit an example conference request from the selected Tenant's persisted catalogue and Site/Room configuration.
- Conference Manager: inspect the same persisted Request, execute supported server-authorized workflow decisions, and review planning and reporting projections.
- Tenant Admin: inspect and edit the selected Tenant's server-backed Organization, Locations, Catalogue, Booking Policies and Cost Allocation; exercise the deterministic integration simulation; inspect Users, audit and readiness.
- Tenant Admin bulk transfer: download a template or minimized export, validate the selected document, apply the receipt-backed change, and verify that replay is idempotent. Reset restores the canonical seed revision and clears mutable receipts.
- Confirmed request print view: open the visitor information view. The baseline route link is external but is contacted only after deliberate navigation; its QR image is served by the Demo origin.

Changing Tenant or persona calls `PUT /api/v1/demo/session/context`, rotates the effective server-owned context and reloads the presentation. A reload, fresh browser profile or second browser observes the same persisted business state after establishing its own session.

The context change selects a deterministic server-owned fixture Principal; it does not recreate browser fixtures. The seeded Tenant presentation remains the PAVUREL product-default presentation unless an authorized Tenant setting changes it.

## Representative shared-Demo story

1. Reset/reseed and record the seed version/checksum.
2. In the Platform Demo, prepare or activate a seeded Tenant through the Platform API.
3. In the Customer Demo, select that exact Tenant and the Tenant Admin persona; update its supported settings and integration simulation.
4. Switch to Employee, create and submit a Request using the persisted Tenant configuration.
5. Switch to Conference Manager, review the same Request and complete the supported decision.
6. Switch back to Employee and verify the persisted result and history.
7. Return to the Platform Demo and verify the privacy-minimized projection for the same Tenant ID.
8. Repeat a bounded negative attempt against the second seeded Tenant to demonstrate that shared persistence does not weaken Tenant isolation.

Deterministic provider scenarios do not claim real identity, Microsoft 365 or Production evidence.

## Network and data-safety verification

The Customer Demo CSP limits connections to `'self'`; expected requests are same-origin `/api/*` calls. No cross-origin API, real identity-provider, Microsoft Graph, external image or QR service is contacted automatically. API/session/schema failure must render an unavailable or error state and must never activate browser persistence or fixtures as fallback.

Run the focused checks with:

```bash
npm run check:architecture
npm run check:persistence
node --test tests/customer-demo-session.test.js tests/customer-demo-boundaries.test.js
npx playwright test tests/e2e/demo-role-switch.spec.js
npm run check:static
```

Use the repository-wide `npm run check`, `npm run audit` and full Chromium/WebKit Playwright suite before integration.

## Continuous integration

Frontend CI runs the shared PostgreSQL journey exactly once in its dedicated
`shared-demo-e2e` job. The regular `e2e` job continues to own only
`tests/e2e`; the shared job invokes `npm run test:e2e:shared-demo`, whose
configuration owns only `tests/e2e-shared`. This separation prevents duplicate
browser execution while keeping both suites required for frontend changes.

The shared job checks out the API at immutable commit
`3e42124a6b120c4ebb2da87273a31bd95381f978`, provisions an isolated PostgreSQL
database, runs the canonical and Demo migrations, starts the separate Customer
and Platform API processes, requires both real readiness endpoints to pass, and
then executes the shared browser journey. Because `conference-manager-api` is
private, repository administrators must configure `SHARED_DEMO_API_READ_TOKEN`
as a read-only Actions secret. The job fails closed before checkout when the
credential is absent; no secret value is printed or included in artifacts.

The reciprocal API CI resolves the functional frontend journey from the immutable
`DEMO_FRONTEND_REF` in the reviewed Render Blueprint. The approved frontend release
is `07f2896d56e6f66a9f8daf96457ab12c763adf80`; the reviewed hosted API evidence
baseline is `3e42124a6b120c4ebb2da87273a31bd95381f978`. Required API CI validates
architecture/security gates, PostgreSQL 18 migrations and persistence, real Demo
readiness, and the same shared journey in Chromium and WebKit before a provider
deploy is eligible for hosted acceptance.

## Hosted Render acceptance

The operational SaaS 3.5 Demo uses the provider-managed HTTPS origins:

- Customer: `https://conference-manager-demo.onrender.com`
- Platform: `https://conference-manager-ops-demo.onrender.com`

Both Render services use the explicit bounded Demo request capacity `DEMO_RATE_LIMIT_MAX=1000` with the fixed 60-second runtime window. This is the same capacity exercised by the required isolated shared-Demo browser journey. It remains inside the backend hard configuration bound of 10,000 and does not affect Production rate limiting.

`.github/workflows/hosted-demo-acceptance.yml` is the external acceptance gate for
those public services. It does not start a local API or use a database credential.
The workflow is triggered by changes to its acceptance infrastructure and to
`tests/e2e-shared/**`, because that shared suite is the exact critical journey reused
against the public deployment.

The job has an explicit 30-minute ceiling but does not allow the readiness phase to
consume that entire budget. It records its own start epoch before checkout, limits the
combined Customer/Platform cold-start polling phase to 360 seconds, and then checks
the elapsed job time immediately before the destructive journey. The journey may
start only while at least 900 seconds of the declared job budget remain. If setup,
readiness or preflight identity verification consumed too much time, the run fails
before any business mutation. This reserve covers the 180-second browser journey,
bounded failure diagnostics, two bounded reset passes, the post-journey identity
check, artifact upload and failure enforcement.

The workflow first waits for both public readiness endpoints within the bounded
Render Free cold-start window. It then fetches
`/assets/hosted-demo-deployment.json` from both origins and requires the closed
schema-v1 deployment identity to match the exact reviewed API and frontend commit
refs before any destructive browser action starts. Metadata requests have an
explicit 20-second deadline. Missing metadata, an unexpected field, stale/mutable
ref, wrong repository/branch, a service identity that does not match its origin, or
a timeout fails acceptance closed.

Only after deployment identity and the cleanup-reserve gate pass does the workflow
run the existing `tests/e2e-shared` critical journey through a fixed-origin local TLS
test proxy. The proxy can target only the two source-defined Render origins, rewrites
the local test Host/Origin/Referer values to their matching deployed same-origin
values, validates upstream TLS normally, and has no general-purpose destination input.

The fixed test proxy observes the server-generated `X-Request-ID` only for a
Platform Demo reset that returns a 5xx response. It writes that UUID to a private,
run-ID/run-attempt-specific temporary file using create-only semantics. When the
journey fails, the diagnostic step reads that exact request ID before cleanup and
accepts only a server-side reset failure audit event with the same correlation ID
and a timestamp inside the acceptance window. This ordering is required because a
successful reset truncates and recreates Platform audit state. Diagnostic
session/persona/audit requests have explicit 20-second deadlines, so this bounded
evidence read cannot consume the reserved cleanup window. A journey failure unrelated
to reset emits `not_available` rather than attributing another user's reset event to
this run.

After the bounded failure-evidence read, baseline restoration has priority over all
remaining evidence calls. The workflow establishes fresh Platform Demo
`security_admin` authority and performs the deterministic reset/reseed cleanup using
bounded session/persona requests and a 75-second reset request deadline, which
remains longer than the backend's bounded 60-second hosted reset budget. The cleanup
then establishes fresh authority a second time and performs the reset again. Both
successful resets must return the fixed seed version and the canonical semantic
checksum
`2869d16d01b34eb284a9a84f964a8b83e720b8ea780c65b65ae467a2f4c29b5f`,
independently derived from pinned API release
`3e42124a6b120c4ebb2da87273a31bd95381f978`. The two responses must also match
each other; otherwise cleanup fails closed. Only that canonical matching pair
records `cleanup_repeatable=true`.

After a successful journey, or after the failure cleanup attempt, the workflow
fetches both deployment identity artifacts a second time and requires the same exact
reviewed refs again. A provider redeploy between preflight and the end of the tested
operation therefore fails acceptance rather than allowing evidence from one build
to be attached to requests served by another. Only a successful second check records
`deployment_identity_stable=true`. Because failure cleanup runs before this
post-journey metadata check, a stalled or failed identity request cannot prevent
baseline restoration; the metadata request itself is also bounded to 20 seconds.

The hosted acceptance run uses Chromium once to avoid duplicating destructive
reset/reseed traffic against the shared public Demo. Cross-browser Chromium and
WebKit coverage remains mandatory in the isolated frontend/API CI matrices. The
hosted journey itself proves the deployed environment for the exercised controls:

- both public readiness endpoints return HTTP 200;
- the two public build-identity artifacts match the reviewed API/frontend refs before and after the journey/cleanup boundary;
- Customer and Platform sessions/cookies remain separate;
- browser LocalStorage/sessionStorage clearing does not erase authority;
- a Platform lifecycle mutation propagates to the Customer surface;
- Tenant Admin configuration propagates to Employee and later Platform projection;
- Employee and Conference Manager use the same persisted Request and history;
- cross-Tenant object access remains concealed;
- missing CSRF and insufficient Platform authority fail closed;
- deterministic provider degradation remains bounded and server-defined;
- reset/reseed invalidates both session domains, restores a repeatable baseline checksum and can be repeated reproducibly.

The evidence file initially records only the fixed provider origins, **expected**
frontend/runtime refs, acceptance source SHA, GitHub run ID, run attempt and start
time. When the cleanup-reserve gate passes, it additionally records only the number
of seconds reserved for the destructive phase. The preflight verifier adds
`verified_frontend_ref` and `verified_runtime_ref` only after both public
build-identity artifacts satisfy the closed contract. Static workflow constants are
therefore not mislabeled as deployed evidence. Correlation-matched failure diagnostics
are captured before reset cleanup; successful cleanup records only the fixed seed
version, matched checksum and `cleanup_repeatable=true`. The post-journey verifier
adds only the bounded stability marker after both origins still report the same
reviewed release.

The journey uses a captured step outcome. On failure the workflow executes bounded,
correlation-matched diagnostics, then the bounded two-pass repeatability cleanup,
then post-journey deployment verification. Evidence is uploaded under `always()`,
and the original journey failure is finally re-raised. A cleanup failure is also a
failed acceptance and is never ignored. No database URL, session/CSRF value,
provider token or other credential is written to the evidence artifact.

A run that begins while a Render Free service is spun down additionally supplies the
cold-start eventual-readiness evidence required by #157. A warm run proves hosted
functional readiness but must not be mislabeled as cold-start evidence.

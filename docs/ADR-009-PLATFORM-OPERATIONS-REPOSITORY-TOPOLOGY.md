# ADR-009: Keep Platform Operations in the Existing Application Repositories

## Status

**Accepted — KEEP frontend and backend source repository ownership.**

- Decision issue: [#151](https://github.com/floriankreutzer/conference-manager/issues/151)
- Parent roadmap: [#149](https://github.com/floriankreutzer/conference-manager/issues/149)
- Decision date: 2026-08-30
- Governance evidence refreshed: 2026-08-31
- Roadmap baseline: approved roadmap version 10, 2026-08-30
- Supersedes: no previous decision; revalidates the SaaS 3 decision in `docs/SAAS3-PLATFORM-CONTROL-PLANE.md`

This decision is about source repository ownership. It does not combine customer and Platform artifacts, processes, origins, sessions, database roles, authorization policies or audit domains.

## Context

SaaS 3 implemented four independently composed runtime artifacts in two repositories:

| Source repository | Runtime artifact | Required isolation |
| --- | --- | --- |
| `conference-manager` | Customer browser application | Customer origin, customer session and customer API only |
| `conference-manager` | Platform Operator browser application | Operator origin, Platform session and `/api/v1/platform/*` only |
| `conference-manager-api` | Customer API process | Customer Principal, routes, secrets and customer runtime database role only |
| `conference-manager-api` | Platform API process | Platform Principal, routes, secrets, audit and Platform runtime database role only |

`conference-manager-website` is a third repository only because it is a public marketing/product website with a different publishing purpose. It is not an application-authority repository and is not a destination for customer, Platform or Demo code.

Issue #151 requires the topology to be reconsidered against the implemented source graph, independent deployment needs, privileged review requirements, shared business rules, audit atomicity and the SaaS 4 provider roadmap. A repository boundary is a source-governance boundary; it is not an authentication, authorization or network control.

## Decision

Keep both Platform browser source and customer browser source in `conference-manager`. Keep both Platform API source and customer API source in `conference-manager-api`.

Continue to produce four separate artifacts/processes with these non-negotiable boundaries:

- the customer and Platform frontend entry points have separate deployment manifests and origins;
- the customer and Platform backend have separate composition roots, route registries, configuration namespaces, secrets, Principals, sessions, cookies, CSRF keys and runtime database roles;
- Production and Demo have separate composition and configuration and cannot fall back to one another;
- customer capability internals and Platform Operator internals remain private from one another;
- Platform HTTP reuses canonical application/domain services through explicit ports rather than copying business rules;
- customer-impacting Platform mutations preserve atomic authoritative state, Tenant audit and Platform audit transactions in PostgreSQL;
- SaaS 4 providers implement the existing provider-neutral integration boundaries in the backend repository rather than creating an Operations-owned copy of booking or Tenant rules.

No blocking repository migration issue is required. The governance controls listed below remain release requirements; the KEEP decision does not waive them.

## Evidence

### Frontend domain cohesion and isolation

- The audited SaaS 3 `main` baseline contains 142 source modules and 326 static import edges with no unresolved relative imports or cycles.
- Customer composition remains under `index.html`, `src/app.js`, customer `src/platform/`, Employee, Manager and Tenant Admin boundaries.
- Platform Operator composition remains under `platform-admin/index.html`, `platform-admin-demo/index.html` and `src/platform-admin/`.
- `deployment/platform-admin-production.json` and `deployment/platform-admin-demo.json` already make Platform artifacts independently enumerable. The customer artifact remains a separate entry point.
- `scripts/check-platform-admin-boundaries.mjs` rejects customer-to-Platform imports, Platform-to-customer capability imports, Production/Demo cross-imports, browser storage in Platform Production, and cross-runtime reachability.
- The two browser artifacts deliberately share design tokens, safe UI primitives and the canonical localization catalogue. Moving Platform source would require versioned duplication or a new shared package/build pipeline without creating a stronger runtime authorization boundary.

The architecture audit found targeted consolidation work in the customer Demo and legacy compatibility paths. Those findings are owned by #150/#153 and are not evidence that the Platform Operator source needs a separate repository.

### Backend domain cohesion and process isolation

- The customer process is composed through `src/index.js` and `src/app.js`; the Platform process is composed through `src/platform-main.js`, `src/platform-composition.js` and `src/platform/app.js`.
- Platform identity, session, authorization, target-scope, HTTP and audit modules are already isolated under `src/platform/`, while customer Principal/session and customer route composition remain separate.
- Architecture gates reject route, Principal/session, persistence/provider and dependency-direction leakage between the process roots.
- Platform use cases deliberately reuse canonical Tenant lifecycle, readiness, entitlement, onboarding, integration and recovery rules through explicit services and ports.
- One PostgreSQL schema and transaction model permits customer-impacting Platform mutations to commit authoritative state, Tenant audit and Platform audit atomically. Splitting backend source would otherwise require a privileged service-to-service API, a shared versioned package, duplicated business rules or a distributed transaction/outbox redesign.
- SaaS 4 provider registration, jobs, retry and webhook work belongs behind the existing provider-neutral integration/application contracts. It does not require Platform Operations to own a second copy of Employee/Manager workflow or Tenant configuration.

### Release and operational independence

Independent deployability is provided by artifact/process composition, not by source repository count:

- frontend manifests enumerate the files for each Platform artifact and can be released separately from the customer entry point;
- backend `start` and `start:platform` commands produce separate processes with separate configuration and readiness boundaries;
- deployment/IaC remains responsible for independent origins, routes, workload identities, runtime database grants, secrets, monitoring and rollback;
- a single source change can be reviewed and tested against all affected artifacts, avoiding uncoordinated cross-repository contract drift.

A future need for fully independent source release cadence can trigger a new decision, but the implemented SaaS 3/SaaS 3.5 scope does not demonstrate that need.

### Public website

The audited `conference-manager-website` baseline is marketing/presentation-only. It has no customer or Platform session, application domain, privileged API, Tenant data, provider credential or Demo reset authority. It remains separate and is not a candidate to absorb either application.

## Required governance and security controls

KEEP is valid only while the following controls remain enforceable:

1. Architecture gates reject private-boundary imports, route/composition crossover, Production-to-Demo reachability, session/authority reuse, cycles and prohibited persistence/provider leakage.
2. Production artifact manifests exclude the other trust domain and all Demo-only seed/reset/session/provider files.
3. Pull requests affecting `src/platform-admin/`, Platform deployment manifests, `src/platform/`, Platform migrations, Platform persistence, Platform security documentation or their gates require an explicitly assigned privileged/security owner review through CODEOWNERS or an equivalent enforceable repository rule.
4. `main` requires pull requests, successful mandatory quality/security checks, resolved review conversations and at least one approval from an eligible reviewer.
5. Required checks include repository quality/architecture tests, dependency/SCA review, secret scanning and configured static security analysis; PostgreSQL and affected DAST/E2E gates remain required for their scope.
6. Customer and Platform deployment credentials, signing/audit keys, database roles and incident ownership remain separate even though source repositories are shared.

### Current governance gap

Live repository rules were re-read on 2026-08-31 after the SaaS 3.5 runtime PRs were integrated. The earlier API `HTTP 403`/unprotected-repository description is no longer current, but the required KEEP governance is **still not fully enforceable**:

- `conference-manager` has the active `main-devsecops-protection` ruleset. It requires resolved review conversations and named quality/security checks including `quality`, `e2e`, `dependency-review`, `gitleaks` and CodeQL, but its pull-request rule currently reports `required_approving_review_count: 0` and `require_code_owner_review: false`.
- `conference-manager-api` now has an active repository ruleset, but the current rule set only prohibits branch deletion and non-fast-forward updates. It does not enforce pull-request approval, CODEOWNERS/equivalent privileged review, resolved conversations or named status checks on `main`.
- CODEOWNERS files can document intended ownership, but ADR-009 requires that privileged review be enforceable rather than advisory.

This remains a real release-governance blocker, not a reason to select SPLIT:

- a source split would not itself create the missing approval/check enforcement;
- a split would not provide runtime/session/authorization isolation;
- the implemented four-artifact/two-repository topology continues to satisfy the architecture, transaction and deployment evidence for KEEP.

Before #151 and #155 can close, the repository owner must configure repository rules so both application repositories enforce the ADR-009 controls: pull-request review for protected `main`, at least one eligible approval, CODEOWNERS or an equivalent privileged/security owner requirement for the listed Platform-sensitive paths, resolved review conversations and the mandatory quality/security checks appropriate to each repository. The resulting ruleset state must be re-read and recorded as evidence. Until then SaaS 3.5 must not claim its protected-review Definition of Done.

## Consequences

### Positive

- canonical business rules remain in one backend source repository;
- customer-impacting Platform mutations keep simple, audit-atomic PostgreSQL transactions;
- frontend design, localization, accessibility and defensive API primitives remain governed once;
- architecture and security tests can verify customer/Platform separation in one PR;
- four deployable artifacts/processes preserve runtime blast-radius and credential separation;
- SaaS 4 can extend provider-neutral ports without a repository migration or copied workflow model.

### Costs and obligations

- each source repository remains a shared supply-chain boundary, so privileged paths need enforceable ownership and mandatory security review;
- CI must execute boundary checks for every artifact/process affected by a shared change;
- deployment automation must package and release artifacts independently and must not use repository co-location as permission to share origins, sessions, secrets or database credentials;
- cross-domain shared primitives require conservative review to prevent `src/shared`, `src/core` or backend application services from becoming dumping grounds;
- the current cross-repository review/ruleset enforcement gap blocks #151/#155 until externally corrected and evidenced.

## Alternatives considered

### Split the Platform Operator frontend into a new repository

Rejected for the current scope. It would duplicate or version the build-free frontend governance, design tokens, localization and safe UI contracts. The existing artifact manifest, entry-point and import gates provide the required deployment and module isolation. A new repository would not create server-side authorization.

### Split the Platform API into a new repository/service

Rejected. The Platform process already has a separate composition root, session and database role. A source split would require copied rules, a shared package or a privileged service-to-service boundary and would complicate atomic Tenant/Platform audit transactions without a demonstrated release or ownership benefit.

### Split both Platform artifacts into an Operations repository

Rejected. Combining an untrusted browser artifact and trusted API process in a new repository does not align ownership by runtime or trust boundary. It also creates a third standards/CI/security-governance surface while preserving all existing deployment separation requirements.

### Combine customer and Platform artifacts/processes because source is shared

Rejected. Source co-location never authorizes shared origins, routes, sessions, Principals, CSRF keys, secrets, runtime database roles or audit domains.

### Move application code into `conference-manager-website`

Rejected. The website is a public marketing/publishing surface and must remain free of SaaS business/session authority.

## Revisit triggers

A new repository-topology ADR is required before:

- a legally or organizationally independent team must control Platform source with a separate mandatory reviewer population that cannot be enforced in the current repositories;
- Platform and customer release cadences become operationally incompatible despite separate artifact/process pipelines;
- Platform source requires materially different dependency, language, runtime or supply-chain governance;
- a reviewed service contract can preserve application-service reuse and audit consistency better than the current in-repository process boundary;
- the shared frontend contracts require an independently versioned package for reasons stronger than directory isolation;
- incident or supply-chain evidence demonstrates that current source co-location creates an unacceptable risk that enforceable path ownership and artifact isolation cannot mitigate.

None of these triggers permits weakening the customer/Platform runtime boundaries while the decision is reconsidered.

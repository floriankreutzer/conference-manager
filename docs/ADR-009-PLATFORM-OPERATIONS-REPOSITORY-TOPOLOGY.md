# ADR-009: Keep Platform Operations in the Existing Application Repositories

## Status

**Accepted — KEEP frontend and backend source repository ownership.**

- Decision issue: [#151](https://github.com/floriankreutzer/conference-manager/issues/151)
- Parent roadmap: [#149](https://github.com/floriankreutzer/conference-manager/issues/149)
- Decision date: 2026-08-30
- Governance amendment: ADR-011, accepted 2026-08-31
- Roadmap baseline: approved roadmap version 10, 2026-08-30

## Decision

Keep Customer and Platform browser source in `conference-manager` and Customer and Platform API source in `conference-manager-api`. Continue to produce four separately composed runtime artifacts/processes. Source co-location does not combine Customer and Platform origins, sessions, cookies, CSRF keys, Principals, authorization policies, audit domains, secrets or runtime database roles.

`conference-manager-website` remains a separate public marketing/product repository and owns no SaaS business/session authority.

## Evidence

The post-SaaS-3 architecture audit found that the current two-repository/four-runtime topology preserves canonical business-rule ownership, atomic Tenant/Platform audit transactions, provider-neutral SaaS 4 extension boundaries, separate frontend artifact manifests and separate backend composition roots without requiring copied business implementations or a privileged service-to-service split.

Permanent architecture gates reject Customer/Platform private-boundary imports, Production/Demo reachability, session/authority reuse, prohibited persistence/provider leakage, reversed dependencies and cycles. Production artifact composition excludes Demo seed/reset/session/provider authority.

## Governance controls

The target governance model remains:

1. source changes use branch and pull-request integration rather than intentional direct development on `main`;
2. configured mandatory quality/security checks and resolved review conversations must pass;
3. architecture, dependency, secret, PostgreSQL, DAST and E2E gates remain mandatory for their applicable scope;
4. Platform-sensitive paths use independent privileged/security-owner review when an eligible independent reviewer population exists or live repository rules require it;
5. Customer and Platform deployment credentials, signing/audit keys, database roles and incident ownership remain separate.

### Solo-developer amendment

ADR-011 is the later approved decision for the current solo-developer condition. While exactly one human developer owns and develops the application repositories, the target requirements for an independent human approval and a distinct privileged/CODEOWNERS reviewer are suspended as a documented organizational risk acceptance.

ADR-011 does **not** authorize bypassing root `AGENTS.md`, branch protection, any review actually required by live repository rules, required status checks, security gates or test gates. It also does not weaken runtime authorization, Tenant isolation, Customer/Platform separation or Production/Demo boundaries.

The exception expires automatically when a second regular developer or eligible independent maintainer/security reviewer exists, organizational/Production governance requires separation of duties, or live repository rules require independent approval/CODEOWNERS review. At that point the target independent-review controls become mandatory before the next material Platform/security release.

## Consequences

### Positive

- canonical business rules remain in one backend source repository;
- customer-impacting Platform mutations retain audit-atomic PostgreSQL transactions;
- frontend design, localization, accessibility and defensive API primitives remain governed once;
- architecture/security tests verify Customer/Platform separation in one change set;
- four deployable artifacts/processes preserve runtime and credential isolation;
- SaaS 4 can extend provider-neutral ports without a repository migration.

### Accepted current governance risk

During solo development there is no independent human segregation of duties for source review. This limitation is explicit rather than represented as a control that does not actually exist. Automated architecture/security/test gates and the normal PR workflow are compensating controls, not a claim of equivalent human independence.

## Alternatives rejected

### Split Platform frontend

Rejected for current scope. It would add package/build/localization/design governance without creating server-side authorization or a meaningful reviewer population.

### Split Platform API

Rejected. Separate process/session/database-role boundaries already exist; a source split would require copied rules, a shared versioned package or a privileged service-to-service boundary and would complicate atomic Tenant/Platform audit transactions.

### Split both Platform artifacts into an Operations repository

Rejected. A third source repository would add governance surface while preserving all existing runtime separation requirements and would not solve the solo-review constraint.

### Move application authority into `conference-manager-website`

Rejected. The website is a public marketing/publishing surface and must remain free of SaaS business/session authority.

## Revisit triggers

A new repository-topology/governance decision is required when:

- a second regular developer or independent security/maintainer reviewer joins;
- Platform and Customer release cadences become operationally incompatible despite separate artifact/process pipelines;
- Platform source requires materially different dependency/runtime/supply-chain governance;
- organizational or Production governance requires independent approval;
- incident/supply-chain evidence shows that source co-location creates risk that path ownership and artifact isolation cannot mitigate.

None of these triggers permits weakening Customer/Platform runtime boundaries while topology is reconsidered.

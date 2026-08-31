# ADR-011: Solo-Developer Review Governance Exception

## Status

**Accepted — explicit temporary amendment to ADR-009 review-separation controls.**

- Decision owner: repository/product owner
- Decision date: 2026-08-31
- Amends: ADR-009 — Keep Platform Operations in the Existing Application Repositories
- Related issue: #151
- Parent roadmap: #149
- Scope: `conference-manager` and `conference-manager-api` while they are developed by one human developer

For the duration of the solo-developer condition, this ADR is the later approved decision for the specific ADR-009 requirements that demand an independent human approval and a distinct privileged/CODEOWNERS reviewer. Those two ADR-009 requirements and the corresponding statement that their absence blocks #151/#155 are suspended only to the extent defined here. All other ADR-009 architecture, security, artifact, process, credential, test and release requirements remain in force.

The root `AGENTS.md` prohibition on bypassing branch protection, required reviews, required status checks, security gates and test gates is not waived. This decision does not bypass a configured required review: the current live repository rules require no independent approval. If a repository rule later makes a review mandatory, that configured review is mandatory and this ADR does not authorize bypassing it.

## Context

ADR-009 originally required at least one eligible independent approval and privileged/security-owner review for Platform-sensitive changes. The repositories currently have one human developer and owner. Requiring an independent human approval would therefore create a control that cannot be satisfied without adding a second person solely to approve changes.

The repository/product owner has explicitly accepted this organizational limitation for the current solo-development phase and instructed that it be recorded as an exception rather than block SaaS 3.5 indefinitely.

This exception does not assert that self-review is equivalent to independent review. It records a conscious temporary risk acceptance with compensating automated and process controls.

## Decision

While exactly one human developer owns and develops the application repositories, ADR-009 controls requiring an independent human approval and a distinct CODEOWNERS/privileged-security reviewer are excepted.

The exception applies only to review separation. It does **not** waive or weaken:

- branch-based change delivery through pull requests where supported by the repository workflow;
- repository `AGENTS.md` and coding/security standards;
- any review, approval or status check actually required by live branch/ruleset configuration;
- architecture and module-boundary gates;
- authentication, authorization, Tenant-isolation or BOLA/IDOR controls;
- Customer/Platform trust-domain separation;
- Production/Demo separation and no-fallback rules;
- mandatory quality, test, dependency, secret and static-security checks already configured for the affected repository/change;
- PostgreSQL integration, DAST and browser E2E where applicable;
- resolution of valid automated or agent review findings before integration;
- prohibition on bypassing failing security or quality checks merely to merge a change.

No runtime security boundary is changed by this exception.

## Compensating controls

During the exception period:

1. Source changes continue through a dedicated branch and pull request rather than being intentionally developed directly on `main`.
2. All repository-mandated and live-ruleset checks applicable to the change must pass before integration.
3. Architecture, Production/Demo, Tenant-isolation, authorization, dependency and secret gates remain enabled and may not be weakened to compensate for the missing reviewer.
4. Valid automated review findings and unresolved review threads must be corrected or explicitly resolved before integration.
5. Security-sensitive changes must include negative authorization/Tenant-isolation regression coverage where applicable.
6. Decisions, exceptions and release evidence remain documented in GitHub and Confluence so the absence of independent review is visible rather than implied away.

## Exit criteria

This exception expires automatically when any of the following becomes true:

- a second regular human developer joins the project;
- an eligible independent maintainer/security reviewer is established for the repositories;
- the repositories move under an organization/team governance model that provides an independent reviewer population;
- Production/commercial governance requires independent approval regardless of team size;
- live repository rules require an independent approval or CODEOWNERS review.

At that point, before the next material Platform/security release, the repository owner must:

1. configure or retain at least one eligible approval on protected `main`;
2. configure CODEOWNERS or equivalent enforceable privileged/security ownership for ADR-009 sensitive paths;
3. require resolved review conversations and repository-appropriate mandatory quality/security checks;
4. retire this exception from active release governance and record the replacement evidence.

## Consequences

### Accepted risk

Changes can be authored and integrated without independent human approval while the project has only one human developer and while live repository rules do not require such an approval. This is weaker segregation of duties than ADR-009's target governance model.

### Why the exception is bounded

Creating a nominal second approver solely to satisfy a checkbox would not create meaningful independent review. The current automated architecture/security/test gates provide stronger evidence than a fictitious separation-of-duties claim, while the exception makes the residual governance risk explicit.

### Non-consequences

This exception does not justify a repository split, shared Customer/Platform authority, weaker server-side authorization, relaxed Tenant isolation, Demo fallback in Production, reduced test coverage, disabled security scanning or bypass of any live required review/check.

## Revisit

Review this ADR at the start of each milestone that materially changes Platform security/governance and immediately when the solo-developer condition ends or live repository review requirements change.

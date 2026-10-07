# SaaS 3.9 — Infrastructure & Security

## Status and authority

SaaS 3.9 is the approved infrastructure/security milestone between the SaaS 3.x Demo/product baseline and SaaS 4 integration expansion. GitHub milestone 12 and issues #247–#254 own implementation and acceptance evidence.

The approved repository boundary and delivery/publication mechanisms are implemented. Application and API are private, Website and Developer are public, and the inactive private Archive is archived. Final acceptance and administrative completion are recorded in #254 after executed current-pair gates. This mechanism does not publish an unreleased SaaS 4 API contract.

Current delivery: #251 is implemented by API PR #103. Hosted preparation uses the reviewed `vendor/demo-frontend` Gitlink and verifies its HEAD against the immutable Render pins; anonymous source fetching has been removed. API PR #106 adds the fail-closed public API publication pipeline. Website PR #78 delivers the public EN/DE Demo entry; application PR #261 retires the duplicate application-repository Pages publication. These delivered mechanisms preserve Customer/Platform authority. #254 also records the completed owner-setting operations, legacy application Pages retirement and post-private validation.

## Current owner exception — 7 October 2026

The owner temporarily made `conference-manager` and `conference-manager-api` public so Actions could execute again after the included private-repository allowance was exhausted. GitHub repository metadata confirmed both were public on 7 October. The private visibility statements and table below describe the accepted 4 October cutover, not the current temporary setting. Authenticated immutable delivery, source-secret prohibitions and mandatory security/test gates remain unchanged. Restoring the accepted private-source boundary remains outstanding; current public-source runs do not constitute post-private acceptance. API PR #114 addresses a newly reported sharp/librsvg security finding; its accepted publication and refreshed counterpart validation remain separate from historical #254 closure.

## Objectives

SaaS 3.9 establishes a deliberate public/private source boundary, removes public source availability as a Demo deployment dependency, creates a governed public integration-documentation surface, and performs the final private-source cutover only after technical evidence proves that all dependent workflows continue to operate.

## Verified repository boundary — 4 October 2026

| Repository | Verified visibility | Responsibility |
| --- | --- | --- |
| `conference-manager` | Private | Authenticated browser application, application tests, architecture/security/governance documentation |
| `conference-manager-api` | Private | Trusted backend, persistence, identity/authorization, provider adapters, canonical API contracts |
| `conference-manager-developer` | Public | Approved external integration documentation, released API artifacts, synthetic examples and public changelog |
| `conference-manager-website` | Public | Public unauthenticated website and approved public Demo landing surface |
| `conference-manager-Archive` | Private + archived | Historical material only |

Repository visibility is not itself a security boundary. Secrets, credentials, customer data and private operational material are prohibited from source control regardless of visibility.

## Work packages

1. **#247 — Exposure and dependency inventory.** Classify repository content and all build/deployment/Pages/cross-repository dependencies before changing visibility.
2. **#248 — Publishing policy.** Define and enforce what may cross from private source repositories into public repositories.
3. **#249 — Developer Portal.** Establish `conference-manager-developer` as the least-information public integration surface.
4. **#250 — Sanitized API publication.** Generate approved public API artifacts from the private backend source of truth with traceability and fail-closed validation.
5. **#251 — Hosted Demo artifact delivery.** Replace the anonymous public Git checkout dependency with a controlled immutable frontend artifact while preserving exact cross-repository binding.
6. **#252 — Public Demo landing surface.** Move the supported public launch surface out of the application repository.
7. **#253 — Website public-content hardening.** Enforce the website repository's intentional public-content boundary.
8. **#254 — Private-source cutover/release gate.** Change `conference-manager` visibility only after every prerequisite is proven and revalidate all repository/deployment protections afterward.

## Non-negotiable cutover rules

- The visibility cutover was performed only after the immutable authenticated delivery prerequisite passed; keep both application repositories private during final acceptance and recovery.
- #251's replacement delivery is implemented; every subsequent release still requires a fresh hosted build and exact identity/acceptance evidence for #254's acceptance record.
- Do not solve the private-source transition by placing an ad-hoc long-lived GitHub PAT or deploy key in Render.
- The replacement delivery path must preserve an immutable frontend source ref, artifact integrity verification and fail-closed behavior.
- Customer Demo and Platform Demo remain separate session/API security boundaries.
- The permanent SaaS 3.7 three-customer progression and two-cycle reset invariant remains mandatory.
- Cross-repository acceptance must use exact immutable counterpart refs.
- Existing branch protection, required checks, dependency/SCA controls, static/SAST controls and secret scanning must not be weakened to complete the cutover.

## Public publishing boundary

The private backend remains canonical authority for API contracts. Public integration artifacts are generated or otherwise deterministically derived, explicitly allowlisted, versioned and traceable to their private source commit. Public repositories must not become independent sources of truth for trusted backend contracts.

The Developer Portal may publish only information external integrators need: released contracts, authentication/onboarding guidance, lifecycle semantics, webhooks where applicable, version/deprecation policy, synthetic examples and integration-specific security requirements.

Internal implementation, operational topology, internal runbooks, private endpoints/schemas, provider research, customer/Tenant information, credentials, production payloads and unnecessary security internals remain private.

## Relationship to SaaS 4

SaaS 3.9 owns repository, publishing and deployment infrastructure. SaaS 4 issues #236 and #237 continue to own the generic Caterer API contract and its complete external documentation. SaaS 3.9 must provide the safe publication mechanism without pre-empting or duplicating that functional API design.

## Definition of Done

SaaS 3.9 is complete only when:
- exposure/dependency inventory and remediation are complete;
- public/private publishing controls are enforced;
- Developer Portal publication is operational;
- hosted Demo deployment no longer requires anonymous public access to application source;
- the public Demo landing surface no longer requires the application repository to remain public;
- the website public-content boundary is hardened;
- a fresh Customer and Platform Demo release passes required acceptance against immutable refs;
- the application repository is made private through #254;
- post-cutover CI, deployment, repository protections and public links are revalidated;
- no unresolved critical/high security finding remains.

Historical documentation of anonymous source fetching remains historical after #251. The supported public Demo entry is delivered by #252 in the website's `/en/demo/` and `/de/demo/` routes (Website PR #78). The duplicate application-repository Pages workflow, portal and portal-only tests were retired by merged PR #261 (`48c04ba4363e5250d5f00dd012f3df78dc428383`). SaaS 3.6 branch integration preserves this retirement while retaining its reviewed Business CSV and named-reference acceptance. Protected-main CI 37198302584, Secret Scan 37198302583, ZAP 37198302592 and reciprocal private-source API CI 37143600305 succeeded. The accepted functional/Hosted baseline and readiness publication sequence are recorded in `docs/SAAS-3.6-RELEASE-EVIDENCE.md`; #254/#170 record the final promoted pair and completed gate. Retirement alone is not the gate.


## Effective post-private security controls

Required `quality`, `e2e`, `dependency-review`, `gitleaks` and `shared-demo-e2e` checks remain strict, with resolved review threads, deletion/non-fast-forward protection and no bypass actors. Quality runs Semgrep CE 1.179.0, repository-owned rule self-tests and the full source scan. The shared conservative SPDX policy checks every lock entry and every nested AND/OR operand; unknown or missing licenses fail closed. The post-private dependency job uses a locked no-lifecycle-script install, audit and this policy. Gitleaks retains full-history scanning and required pull-request read permission.

Private CodeQL is unavailable for the current repository entitlement. The owner reconciled only the unavailable platform rule after the replacement policy passed both PR and protected-main gates. This does not claim execution or identical full-query-suite coverage. The separate read-only CI Reader and sanitized publication Publisher remain narrowly scoped; no paid-plan workaround, source-public rollback, PAT or deploy-key broadening was introduced.

Both public Website Demo routes and the Developer root returned anonymous HTTP 200 on 4 October 2026. Website links directly to the Customer and Platform HTTPS origins without acquiring session, authorization, API or persistence authority. No unresolved repository-controlled Critical/High finding is accepted by this documentation change; Production and external-provider evidence limits remain explicit.

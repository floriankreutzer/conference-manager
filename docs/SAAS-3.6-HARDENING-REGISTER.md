# SaaS 3.6 hardening register

Status date: 2026-09-01
Parent roadmap: #164
Hardening work package: #171
Security-regression work package: #168
Final gate: #170

## Purpose and completion rule

This register is the single evidence-oriented inventory for SaaS 3.6 repository-controlled defects,
security findings, code-quality weaknesses and material documentation/evidence gaps across
`conference-manager` and `conference-manager-api`. A finding is not closed merely because a test is
green: its root cause, Production relevance and controlling regression evidence must be identified.

`Critical`/`High` repository-controlled security findings, Tenant-isolation/privilege/session/CSRF/
Demo-Production-boundary/data-integrity defects and reproducible P0/P1 correctness defects are
release blocking. Medium findings are resolved where a scoped fix is reasonable; residual Low items
must be explicitly non-blocking. Scanner/test suppression is not an accepted disposition.

Production relevance uses the #168 classifications for Demo-originated defects:
`demo-only`, `shared-business-domain`, `production-defect`, or `security-relevant`. Findings that did
not originate in Demo are marked with the narrower relevant runtime/evidence scope instead of being
misrepresented as Demo discoveries.

## Findings

| ID | Severity | Domain/runtime | Production relevance | Finding / evidence | Disposition | Status |
| --- | --- | --- | --- | --- | --- | --- |
| H-001 | High / P1 | Customer frontend session lock | security-relevant | PR #173 review: previously open body-level dialogs could remain interactive above cleared `#app`; language/presentation rerenders could restore stale UI after lock. | `fcec286` closes/removes open dialogs and uses a non-dismissible body-level modal. Final fix must additionally suppress shell rerenders and invalidate pre-lock async render revisions, with lock/unlock/direct-route regression coverage. | **OPEN — release blocking** |
| H-002 | Low / test correctness | Static GitHub Pages Demo launchpad | demo-only | PR #173 regression assertion rejected the documented phrase `static GitHub Pages Demo launchpad`. | `1ca39e5` aligns the assertion. Frontend quality, Secret Scan, Dependency Review, Hosted Demo Acceptance and shared-Demo E2E were green on that head. | Closed |
| H-003 | High / P1 correctness | Conference Manager catalogue UI | shared-business-domain | PR #173 review: moving catalogue ownership out of Tenant Admin removed creation controls, leaving only editing of existing services/equipment/catering entries. Package-variant creation also existed in the previous canonical UI and must not be lost. | Restore safe creation for services, equipment, catering items/packages and package variants under Conference Manager only; preserve stable IDs, currency, validation, optimistic concurrency and the existing authoritative save contract. Add DE/EN parity and browser regression coverage. | **OPEN — release blocking** |
| H-004 | Medium / P2 correctness | Conference Manager workspace UI | shared-business-domain | PR #173 review: `workspace-application` awaits the operational Manager render and may prepend the business-settings card after navigation has already replaced the Manager root. | Bind the prepend to the render-owned/current Manager root or otherwise cancel stale completion. Add navigation-race regression coverage. | OPEN |
| H-005 | High | Customer backend authorization/session | security-relevant | PR #61 review: changing the role-to-permission map did not invalidate already-issued sessions containing old stored permission snapshots. | `ee644cb` namespaces Customer-session token hashes with a SaaS 3.6 security epoch; `9617a0d` proves pre-policy unversioned hashes no longer resolve. Subsequent API quality, PostgreSQL integration and shared-Demo Chromium/WebKit jobs passed. | Closed |
| H-006 | Medium / governance-security | Backend normative authorization docs | Production-relevant documentation | PR #61 review: `TENANT-CATALOGUE.md`, `API.md` and `TENANT-SETTINGS-CONTRACTS.md` still described Catalogue as Tenant Admin + `tenant:configure`. The generic bulk-transfer text also obscured aggregate-specific authorization. | `TENANT-CATALOGUE.md` and `TENANT-BULK-TRANSFER.md` are corrected on the branch. `API.md` and `TENANT-SETTINGS-CONTRACTS.md`, including the field-classified Room/Locations ownership split, remain to be reconciled and re-reviewed. | OPEN |
| H-007 | Medium / test-evidence integrity | Production frontend E2E fixture | Production test path | `tests/e2e/production-application.spec.js` still issues a `conference_manager` test session with only `request:manage`, omitting `tenant:rooms:business:manage` and `tenant:catalogue:manage`. This can hide the newly visible business-settings path or make the role test non-canonical. | Update the fixture to the canonical permission projection and provide bounded settings API fixtures; add focused creation/ownership coverage. Product authorization must not be weakened to make the fixture pass. | OPEN |
| H-008 | Low / stale issue debt | Backend documentation backlog | Documentation only | Backend issue #17 still described schema v10 and an older Entra/documentation baseline although current main documents runtime dependencies and schema 33. | Revalidated current `ARCHITECTURE.md`, `PRODUCTION-SECURE-CONFIGURATION.md` and `pool.js`; issue #17 closed as completed/superseded on 2026-09-01. | Closed |
| H-009 | Medium / governance consistency | Open frontend roadmap/issues | Production-relevant documentation | Older still-open current-state text in #74/#82/#91 assigns Tenant Admin business Room/catalogue maintenance that is superseded by #164/#166. Historical evidence must remain historical, but present-tense ownership is contradictory. | Reconcile under #169 with explicit superseded/current-baseline notes rather than rewriting historical delivery evidence. Search all current roadmap/architecture text for the same contradiction. | OPEN — documentation gate |
| H-010 | Medium / security evidence | DAST coverage | security-relevant evidence | Current `.github/workflows/dast.yml` runs OWASP ZAP Baseline only against the static GitHub Pages launchpad. It does not itself constitute Customer Render, Platform Render or Production application/API DAST evidence. | Keep static-portal DAST. Add/execute appropriate Customer/Platform application DAST where repository/deployed infrastructure permits; keep real Production/deployed acceptance explicitly separate when external infrastructure is required. | OPEN — final-gate evidence |
| H-011 | Medium / security evidence | Code scanning/SAST | Repository-wide | Repository workflows currently expose custom syntax/static/SAST/architecture checks, dependency review/audit and secret scan. No standalone CodeQL workflow is visible in the checked branch workflow tree; repository-level default CodeQL configuration has not yet been evidenced through the available connector. | Do not claim CodeQL clean/absent. Verify the repository security configuration for #170. If CodeQL is not configured and is required/available, add it through the reviewed protected workflow; otherwise document the exact configured SAST evidence and external limitation. | OPEN — evidence verification |
| H-012 | Informational | Source maintenance debt | Repository-wide | Default-branch code search on 2026-09-01 returned no `TODO`, `FIXME`, `HACK`, `TEMP`, `temporary compatibility`, `deprecated` or `legacy` findings matching the hardening sweep query in either repository. | No issue created from this sweep. Continue to classify concrete compatibility/dead-code findings discovered by review/tests rather than using marker counts as a quality metric. | Closed / no finding |

## Current scanner and CI evidence

Evidence is recorded by exact head because a later branch commit invalidates assumptions about a
previous head.

### Frontend head `1ca39e5bc93893a6e73ed5385248a5e9a0c16fef`

- `quality`: success, including high-severity dependency audit and repository syntax/SAST/secret/
  architecture/regression checks;
- Secret Scan: success;
- Dependency Review: success;
- Hosted Demo Acceptance: success;
- shared-Demo E2E: success against the pinned API commit;
- full browser E2E was still running when this register snapshot was created and must be re-evaluated
  on the final post-fix head.

### Backend code head `4f92cc122feb08a6092fc064bdc9a7cdca7a7e81`

The session-security-epoch implementation and its regression test were included in this head. Its
`quality`, PostgreSQL integration and shared-Demo Chromium/WebKit jobs passed; Secret Scan and
Dependency Policy also passed. A later documentation-only branch head exists and must receive its
own final green gate before merge.

Passing these configured jobs does not substitute for the unresolved DAST/CodeQL evidence questions
listed above and does not close open review findings.

## Issue/review inventory rules

- SaaS 3.6 roadmap issues #164-#172 are work packages, not defects by themselves.
- External-acceptance SaaS 1 issues remain external evidence work unless a current repository defect
  is independently reproduced.
- Historical SaaS 2/3 roadmap language is preserved as historical evidence; contradictory present-
  tense ownership must receive a clear superseded/current-baseline note under #169.
- Backend issue #17 was the only open backend issue in the 2026-09-01 issue sweep and is now closed
  because its stated documentation gap is already satisfied by current main.
- PR review findings are first-class hardening findings and are resolved only after fix + appropriate
  regression/progression/negative evidence.

## Remaining mandatory hardening work before #170

1. Close H-001/H-003/H-004/H-007 with code and browser/regression evidence on PR #173.
2. Close H-006 by reconciling all normative backend authorization/ownership contracts and obtaining a
   fresh PR #61 review.
3. Re-run final frontend/backend repository-required checks on the actual final heads.
4. Execute a fresh security-focused PR review on both repositories and add any new finding to this
   register before disposition.
5. Complete the #168 Demo-defect classification sweep, including Production-path inspection and
   adversarial evidence for every `security-relevant` item.
6. Resolve H-009 through #169 GitHub/Confluence current-state reconciliation.
7. Resolve or explicitly govern the H-010/H-011 security-evidence gaps without weakening scanners or
   overstating Production readiness.
8. #170 remains blocked until this register has no unresolved blocking finding and all required gates
   apply to the exact release-candidate refs.

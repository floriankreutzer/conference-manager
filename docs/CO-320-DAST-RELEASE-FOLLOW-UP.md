# CO-320 — DAST identity follow-up for the qualified release

Status: implementation placeholder. The scheduled failure is retained; no new
Customer or Platform scan success is asserted by this document.

## Verified problem

The scheduled [DAST run 42757508382](https://github.com/floriankreutzer/conference-manager/actions/runs/42757508382)
on application Main `cd935478e9c441e6bbd5bddb36b1090d70554124` failed the
pre-scan deployment identity check. Customer job `129635203079` and Platform job
`129635203076` did not execute their ZAP scans. The static launchpad job
`129635202905` completed its scan and reviewed-risk gate successfully.

At that source, `.github/workflows/dast.yml` and
`tests/dast-candidate-identity.test.js` expect:

| Component | DAST expected commit | Existing protected INT release |
| --- | --- | --- |
| Frontend | `ac0cd04281700636743e508335cd20c2325098a2` | `83f883dbccd76a28050f1981c8431f18174f04e7` |
| Runtime | `38a14b0435fb92bfacea319c5414c1fc10aab9eb` | `c146aeab3501b73d71d2fde70cb5b102d4d617a6` |

The existing release is documented in the API repository's
[release record](https://github.com/floriankreutzer/conference-manager-api/blob/4b356b016c2632b5cdfc8a09515e4ffa7179fdd4/docs/QA-20261109-SAAS1-RELEASE.md).
A read of the two existing provider deployment records on 10 November at
05:12 UTC still identified that runtime commit and its immutable release branch.
This provider read did not perform a fresh HTTP or business-session acceptance.

## Diagnosis limits

Each matrix job calls the same verifier over both application origins, starting
with Customer. Two failed jobs therefore do not establish two independently
reached origin failures. The CLI emits the closed failure code
`HOSTED_DEMO_DEPLOYMENT_VERIFICATION_FAILED`; the first failing HTTP, schema or
identity assertion is not exposed. A mismatched configured pair is established,
but the sanitized failure alone does not prove its sole cause. Missing later
ZAP evidence files follow from skipped preparation and scanning.

The protected responder intentionally serves the compatible deployment metadata
path and the constant `branch: 'main'`. A provider `release/int-*` branch does
not by itself contradict that response contract. Preserve this distinction when
reviewing the existing verifier.

## Implementation and dependency order

1. Complete qualification, immutable build evidence, protected release-ref
   controls and deployment of the selected runtime/frontend pair through the
   [CO-320 release procedure](https://github.com/floriankreutzer/conference-manager-api/blob/290e9b77025e9199ec0e3f030ecf4c38a7c2a023/docs/QA-20261109-SAAS1-FOLLOWUP-RELEASE.md).
   Retain both exact provider deployment
   receipts and independently verified served identity and bytes.
2. Update only the two literal DAST expected-commit values and their corresponding
   assertions in `tests/dast-candidate-identity.test.js` to that actually verified
   pair. Use the runtime source commit, separately from any later configuration
   commit. Record the exact source and native evidence in the implementation PR.
3. Keep the manual Hosted acceptance pair and the API's independent CI acceptance
   pins under their existing contracts. A DAST pin correction does not select a
   different application/runtime release.
4. Execute the required repository checks, review and normal PR gates. Execute
   the actual Customer, Platform and static-launchpad DAST jobs with the fixed
   identities, before/after identity verification and their retained raw evidence.
5. Reconcile the resulting source, Main and live-scan evidence in CO-320. Product
   Acceptance and protected Microsoft/passkey business journeys remain separate.

## Acceptance criteria

- Existing readiness, credential-format, pre-scan and post-scan identity guards
  remain active and reject missing or wrong identity; the expected pair is not
  copied from an unverified response to make a check pass.
- Both affected ZAP scans actually execute. An identity-only success, skipped
  scan or successful static launchpad does not satisfy their acceptance.
- Existing exact alert references, origin boundaries, risk limits, evidence-file
  validation and secret-handling rules remain intact.
- Preserve failed run `42757508382`; retain the later successful run's exact
  source, environment, tool/add-on evidence and original report artifacts.
- A Basic perimeter credential is not evidence of a protected business session.

The next implementation touches the owning DAST workflow and identity regression
test after the verified release prerequisite. This placeholder changes only this
document and intentionally leaves those live expectations unchanged until then.

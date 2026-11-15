# ZAP runner executable-mode regression — 15 November 2026

Tracking: CO-299, CO-320. This is source evidence, not a deployment receipt or
product acceptance.

## Finding

Current source baseline `058b1d74daad8df6ba7857e7a63ee15d83d1dd7d` contains
`scripts/run-zap-baseline.sh` with Git mode `100644`. The earlier evidence-cap
change `c92dfd745eb3c664cc51d912ab4f832fc04639bb` changed its previous `100755`
mode while editing its content. The protected frontend selected at
`53fa27a6b994f1559327f9764a0825fbee2e2165` inherited that metadata regression.

The protected INT build checked out the correct API/frontend commits and
Gitlink but found one dirty frontend file: this script had mode `100755` in
the provider checkout. No content or staged change was reported. The existing
clean-source guard correctly refused the build. A build without cached artifacts
failed at the same guard. This evidence identifies the mismatch; it does not
establish which provider preparation operation changed the permission.

## Correction and scope

Restore the script's committed executable mode to `100755` without changing
its bytes. Run the existing credential-containment and target-rejection test
through the actual executable instead of `bash script`, so the test no longer
hides a missing executable bit. Keep a bounded child-process timeout and assert
successful process creation before assessing the expected scanner-stub failure.

The script's origin restrictions, credential handling, alpha/beta rules, complete
evidence settings and scan plan remain unchanged. No runtime UI, dependency,
authorization, persistence, schema, feature flag or data reset changes.
Do not disable Git file-mode checks or normalize modified source before the
protected build guard. Preserve modes explicitly in Git tree API updates.

## Validation boundary

The strengthened test failed with `EACCES` at the old `100644` mode, then passed
after the mode correction. The six focused credential, target and evidence-cap
tests pass under Node 22. Full repository checks, audit and native candidate/Main
checks are recorded separately on the resulting change.

The temporary provider diagnostics only ran after the unchanged build command
failed and unconditionally retained failure. They exposed bounded status/mode
information, not file contents, credentials or environment dumps. The original
command was restored and independently read back after diagnosis.

A new immutable frontend/API pair, its independent artifacts, required native
checks, actual successful provider receipts and served-byte verification are
still required before updating the active observer or DAST release selections.
Earlier successful tests and the failed attempted release are historical evidence
for their exact identities, not substitutes for this release's remaining gates.

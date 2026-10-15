# Dependency update CI

Shared Demo acceptance retains its immutable API commit, both browsers, the full three-customer
progression and two-cycle reset gates. Checkout uses the configured read-only
`SHARED_DEMO_API_READ_TOKEN`, falling back to the job's contents-read GitHub token when the
separate credential is unavailable in a Dependabot context.

The fallback supports the current temporary public-source exception; it does not authorize a
visibility change or grant access to a private counterpart repository. Restoring the approved
private-source boundary requires the explicit read-only credential in the appropriate Actions
and Dependabot secret contexts. An unauthorized checkout still fails and blocks acceptance.
No privileged `pull_request_target` execution, persisted credential or skipped gate is used.

Dependency versions and action commit SHAs remain exact. The Artifact action assertion is
updated with the reviewed action SHA; it continues to reject a different or mutable action ref.
Browser assertions, retries, timeouts, security policies and release invariants remain intact.

Live DAST separately verifies the deployed pair before and after the passive scan. Both services
reported frontend `ac0cd04281700636743e508335cd20c2325098a2` and API
`38a14b0435fb92bfacea319c5414c1fc10aab9eb` on 2026-10-15; these immutable refs are pinned
in `dast.yml`. This live scan checks that deployed baseline, not the unpromoted PR build.

`DAST_OPERATIONS_PASSWORD` is an Actions repository secret containing the existing temporary
Operations perimeter password. It is required for both-service identity verification and for
the Operations scan. Customer and static scans receive no scanner credential. Metadata
authentication is limited to the exact Operations metadata GET with redirects rejected. ZAP's
Replacer rule adds the header only to the anchored HTTPS Operations origin. The generated plan
contains no credential. Raw scanner console output remains in the disposable container; the
six evidence files are checked for raw and Basic-encoded credentials before validation or
upload. Any occurrence blocks upload without rewriting findings. No DAST alert policy or risk
threshold is relaxed. Rotate or remove this CI secret when the temporary perimeter changes.

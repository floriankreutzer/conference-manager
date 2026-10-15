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

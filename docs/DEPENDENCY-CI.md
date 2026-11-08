# Dependency update CI

Shared Demo acceptance retains its immutable API commit, both browsers, the full three-customer
progression and two-cycle reset gates. Ordinary CI uses the scoped, short-lived CI Reader App
token described in [Infrastructure CI optimization](INFRASTRUCTURE-CI-OPTIMIZATION.md).
The legacy `SHARED_DEMO_API_READ_TOKEN` is no longer consumed by this CI. An entirely absent
App credential pair retains the job's contents-read GitHub token only for public sources;
partial credentials or unknown visibility fail before token creation.

The fallback supports the current temporary public-source exception; it does not authorize a
visibility change or grant access to a private counterpart repository. Restoring the approved
private-source boundary requires the complete App credential pair in the appropriate Actions
and Dependabot secret contexts. An unauthorized checkout still fails and blocks acceptance.
No privileged `pull_request_target` execution, persisted credential or skipped gate is used.

Both ordinary CI token steps use the supported `client-id` input of the pinned action.
The existing `CM_CI_READER_APP_ID` secret name and value remain unchanged: at action revision
`64ab729a6294000f5aa4a4bc0b73d1f32bc45510`, both input names feed the same
`createAppAuth({ appId: clientId, ... })` path. This migrates the deprecated alias without
rotating credentials, creating an App or expanding grants. Post-job revocation remains enabled;
native token creation, immutable checkout and cleanup require their own execution evidence.

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
upload. Any occurrence blocks upload without rewriting findings. No scanner rule is disabled and
no risk limit is raised. The authenticated non-storable observation and updated exact static hashes
are reviewed in `DEMO-SECURITY.md`, with negative regression protection. Rotate or remove this
CI secret when the temporary perimeter changes.

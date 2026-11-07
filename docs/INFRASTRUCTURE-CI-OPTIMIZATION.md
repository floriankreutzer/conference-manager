# Infrastructure CI optimization

Tracking: CO-86 (INF-06–11), CO-195 (private cross-repository source access).
Historical source: floriankreutzer/conference-manager#433.

Run local applicable gates before pushing one coherent candidate. Do not rerun an
unchanged complete workflow without diagnosing the previous failure. Required
source, security, browser, three-customer and two-reset gates remain mandatory.

Weekly Dependabot version updates group npm minor/patch changes and GitHub Actions
separately. npm majors stay separate; security updates are not included in these
version-update groups. Existing schedules and five-PR limits remain unchanged.

Multi-checkout jobs cache npm package downloads using all checked-out lockfiles,
not node_modules. Immutable acceptance copying only replaces the explicitly
allowlisted test/support files; it does not mutate package-lock.json. Every checkout
still uses npm ci with lifecycle scripts disabled. Cache misses must work normally.

Release evidence checks out its pinned standalone tool before setup-node hashes
that tool's lockfile. PR updates share a concurrency group; non-PR runs use their
unique run ID so pending main evidence is not replaced by a later commit. Main
attestation permissions, source binding and tamper tests are unchanged.

The separate dependency workflow is retained for now (INF-10): removing a workflow
without a genuinely shared validated result would only rename the same work. A
future consolidation must preserve required status names, license checks and
fail-closed aggregation, with a measured benefit. No required check is removed.

The dated audit is a baseline, not a promised saving. Compare cancelled-run share,
runner minutes per successful candidate, cache hit/miss setup time and dependency
PR count in comparable windows. Current public-runner usage is not an invoice;
private-source restoration requires separately verified quota and read access.

## Cross-repository CI source access

The shared Demo and protected browser jobs use the existing CI Reader GitHub App
to mint a short-lived token restricted to `conference-manager-api` with
`contents: read`. The action is commit-pinned, token revocation remains enabled,
and neither checkout persists credentials. Immutable counterpart refs, the full
browser matrices, all three Demo customers and both reset cycles are unchanged.

Configure `CM_CI_READER_APP_ID` and `CM_CI_READER_PRIVATE_KEY` separately in this
repository's Actions and Dependabot secret stores. Dependabot-triggered workflows
use only Dependabot secrets, including owner-requested reruns. Never extract
write-only secrets via workflow logs or artifacts; use the credential owner's
existing secure source. No new App, PAT, deploy key or permission is required.

A complete credential pair always selects the App path. Partial credentials or
unknown visibility fail before token creation. An entirely absent pair retains
the read-only `github.token` fallback only while the source repository is public;
it cannot authorize a private cross-repository checkout. A private frontend also
rejects an absent pair explicitly. Token or checkout failure must fail the job,
never skip the paired acceptance or turn a failure into a successful check.

The old `SHARED_DEMO_API_READ_TOKEN` is no longer consumed by this CI. Keep its
stored value until the credential owner has confirmed other consumers and the
replacement has passed actual ordinary and Dependabot runs. Source tests and
public fallback runs do not qualify private access. CO-195 records secret-store
verification, each real actor path, private-state execution and controlled
removal of the obsolete credential separately from code integration.

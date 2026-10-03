# Dependency license policy

## Scope and authority

`scripts/check-dependency-licenses.mjs` enforces the repository's declared npm
lockfile-license policy. It is a release control, not a legal opinion or a claim
that all functions of GitHub's hosted Dependency Review service are reproduced.
The accepted application lock graph currently declares only `MIT` and
`Apache-2.0`. Those two identifiers form the reviewed baseline allowlist. A new
license identifier requires an explicit reviewed policy change and regression
coverage; absence from the GPL/AGPL denylist alone is not approval.

## Fail-closed contract

Every third-party `packages` entry in lockfile version 3 is checked, including
development, optional, scoped and nested packages. Only the root application's
own metadata is excluded. Missing, non-string, empty, unreviewed and custom
license metadata block the gate. Invalid, empty, legacy and linked/workspace
lock graphs block rather than silently reducing coverage. This repository has
no approved workspace-license delegation.

Expressions may contain the approved identifiers, parentheses and uppercase
`AND`/`OR`. All operands must be approved, including both sides of `OR`. SPDX's
`OR` normally permits a license choice; this deliberately conservative release
policy does not make that legal choice automatically. GPL-3.0 and AGPL-3.0
aliases, `-only`, `-or-later` and `+` forms remain explicitly denied. Other later
version modifiers and `WITH` exceptions require review and are not interpreted
as permission to bypass a denied or unknown license. Operators are
case-sensitive; approved identifiers are compared case-insensitively.

Expression length and parenthesis depth are bounded. The CLI reads only the
local lockfile, caps its size, makes no registry requests and prints only a
fixed bounded failure code on errors. It never executes expression text or
prints raw untrusted metadata.

## Execution and evidence

```sh
node scripts/check-dependency-licenses.mjs
node --test tests/dependency-license-policy.test.js
```

The test file is selected by the existing `npm test` / `npm run check` path in
the required `quality` job. Besides positive/negative fixtures and CLI tests,
it validates the actual committed lock graph, so missing or denied declarations
are blocking rather than merely a mocked test result.

PR #277 adds this policy and its regression tests while #276 is awaiting
protected integration. After inheriting #276, its inline exact-string license
check in `dependency-review` must be replaced with the same script. Until that
workflow integration and final-head checks are evidenced, this document does
not claim that the standalone dependency-review job is reconciled. Do not copy
or bypass #276's private-repository workflow fixes to obtain an earlier merge.

Locked installation with lifecycle scripts disabled and high/critical npm
vulnerability auditing remain separate required controls. This policy evaluates
lockfile declarations, not copyright ownership, actual license-file text,
package-registry metadata authenticity, non-npm artifacts or all dependency
manifests. It adds no application/runtime dependency. Failure, missing evidence,
or new metadata must not be converted into a success, skip or blanket exception.

Normative syntax reference: [SPDX 2.3, Annex D](https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/).
Issue #254 remains the final acceptance authority. This implementation does not
close SaaS 3.9 or remove the configured CodeQL requirement.

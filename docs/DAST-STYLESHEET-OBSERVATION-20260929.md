# Exact informational Demo stylesheet observation

## Source evidence

Frontend ZAP run 36592014911 failed the Customer surface's exact-alert check.
Raw artifact 11044656472 (`zap-baseline-customer-demo`) has ZIP SHA-256
`f5840dfe1abc9f9e5621f21a0a2d513e5aeb2df98eba7668319f56efbe89b19e`.
It contains informational alert `90005-2` on the exact public GET URL:

`https://conference-manager-demo.onrender.com/assets/demo-security.css?v=20260830-77`

The official rule describes a missing **request** `Sec-Fetch-Mode` header, not a
missing HTTP response security header:
https://www.zaproxy.org/docs/alerts/90005-2/

The existing repository policy already classifies this same informational
crawler/request-header observation for other exact static assets on this
surface. The proposed correction extends that existing classification to this
one observed stylesheet URL only. It is not a waiver for a new risk category.

## Scope and checks

Add exactly one `90005-2` row to the Customer exact policy and regenerate only
the corresponding `90005` summary URL union. Do not add wildcard paths, other
alert subtypes, API routes or origins. The existing risk ceiling remains zero;
no change is made to `reviewed-alert-risks.json`, scan coverage, scanner rules,
raw evidence, scanner version, deployment identity checks or server headers.

Two new tests prove the exact row/summary contract and deny other asset
versions, API URLs, Platform origin, related alert subtypes, POST and higher
risk. The unchanged captured report fails under the old policy and passes the
same validator under the corrected policy, covering all 23 raw instances.

This is a local replay of an existing scan artifact, not a new live ZAP run.
The policy correction requires normal PR review/integration and a fresh scan.
It must not be used to claim the full three-customer release gate is complete.

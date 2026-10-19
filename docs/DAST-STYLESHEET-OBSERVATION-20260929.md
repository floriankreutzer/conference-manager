# Historical Demo stylesheet observation — 29 September 2026

This file is a historical summary, not a current scan result or a new risk acceptance.
The complete dated record, including the original failure and artifact provenance,
is retained in the owner's internal release and acceptance evidence.

The observation concerned a missing crawler request header on one exact static
stylesheet URL. It did not establish a missing response security header or an
authenticated API bypass.

The correction was bounded to the observed informational alert subtype, exact URL
and GET method. Wildcards, other asset versions, API routes, other origins and
higher-risk findings were not approved. The risk ceiling, scanner coverage,
deployment identity checks and security headers were not weakened.

Replay of an existing artifact does not establish a successful fresh live scan.
A changed candidate still requires normal review, applicable security checks and
its own release evidence. Current source policy and tests are authoritative for
the implemented validator; this historical note grants no additional exception.

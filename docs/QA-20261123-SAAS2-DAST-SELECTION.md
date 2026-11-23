# Protected INT DAST selection — 23 November 2026

Tracking: CO-299, CO-320. The existing passive DAST workflow now expects deployed
API `67527b7e054191cd51686d733b9b5575e7beccee` and frontend
`dda63bc08bffacc1f80e2681e12bbee59d8fe4f6`. Actual successful receipts are Customer
`dep-dc2936l6e07s73b4qkkg` and Platform `dep-dc2936l6e07s73b4qld0`, both at
19:19:38 UTC on 23 November. Independent canonical verification subsequently
matched all 512 served files and both API identities, with required state ready.
See the API repository dated release verification for full immutable evidence.

Only the expected DAST pair and its exact regression assertions change. The
manual Hosted acceptance pair, scan policy, URLs, credentials, pre/post identity
checks, evidence boundary and reviewed risk ceilings remain unchanged. This
source change is not a new runtime frontend release. Existing workflow execution
must complete before claiming a DAST result; preceding historical passes do not
qualify the newly deployed pair. No new schedule or observer dispatch is added.
No HTML, CSS, UI copy, interaction or design-system change is included.

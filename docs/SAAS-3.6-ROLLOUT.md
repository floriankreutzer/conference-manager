# SaaS 3.6 Request contract rollout

## Compatibility stage

The Request wire reader accepts the exact existing response envelope v2 and the
exact attribution envelope v3. Envelope v3 requires persisted requester/action
attribution; adding those fields to envelope v2 is rejected. The nested Request
composition version is independent: composition v2 remains frozen, while v3
requires Equipment selection and matching immutable price lines and totals.

This first stage does not enable Equipment catalogue reads, change outgoing
Request versions, render attribution, change permissions or introduce fallback
data. Existing API and frontend behaviour remains the deployed baseline.

## Ordered cutover

1. Merge, verify and deploy the frontend compatibility reader first.
2. Apply the API Equipment, attribution and Guest Information migrations through
   the protected API workflow. Drain old API writers before enforcing attribution
   snapshots. Customer and Platform Demo must use the same compatible API commit.
3. Keep exact v2 Request writes and existing pending v2 proposals supported.
   Switch attribution responses explicitly to envelope v3. Normal Room context
   remains v1; Guest Presentation requires `projection=guest` and envelope v2.
4. Pin CI and hosted Demo to the verified API/frontend pair, then enable the
   Equipment editor, persisted attribution views and Site Guest Information editor.
5. Execute the complete #182 parity gate and #170 release gate before declaring
   Employee/Manager readiness or milestone completion.

Once v3 Requests or post-cutover attribution evidence exists, schema downgrade
must refuse rather than discard historical data. Use a compatible binary or a
forward fix. Record exact final references and executed migration, PostgreSQL,
browser, hosted-Demo and security evidence in the owning issues.

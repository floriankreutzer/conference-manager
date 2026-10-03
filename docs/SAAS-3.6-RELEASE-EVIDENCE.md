# SaaS 3.6 release evidence

Status: validation in progress on 3 October 2026. This working record does not
authorize readiness promotion or close #170/#164 until the live gates below pass.

## Delivered behavior

Employee, Conference Manager and Tenant Admin retain independent, additive,
server-authorized capabilities. Conference Manager owns Request operations,
Room business fields and prices, and the Service/Equipment/Catering Catalogue;
Tenant Admin owns organizational, technical and identity configuration.
Historical Request compositions and actor snapshots remain immutable.

The final #229 correction adds authoritative named references, German/English
native help and strict UTF-8 CSV for Rooms, Services, Equipment, Catering items
and packages. Template, edit, validate, receipt-bound apply, reload, export and
reimport are exercised against real PostgreSQL APIs. File, row, cell and
structured-value bounds remain enforced; larger exports require documented
partial batches. Equipment uses the same Tenant/actor/hash/revision/expiry
receipt boundaries as the other business aggregates.

The earlier integrated #256/#226/#228 corrections restore script-free Guest
printing, the Demo Catering image lifecycle and the compact derived worklist.
All seven genuine tasks must disappear through real business operations and
return after reset. Media detachment requires an empty submitted reference
list, independently empty persisted references and HTTP 404 on byte delivery.

## Functional candidate evidence

| Evidence | Exact candidate/result |
| --- | --- |
| Frontend PR | #259; `821c1ff425a3d7b19c6bd04d34ea3be74b639406` |
| Immutable application checkpoint | `02ea3abce1c78798495519bbf4b5a50a44af961f` |
| API PR | #107; tested head `dc6c5ea7d4dc7b8fd279ea3bce9eb3f885b95c35`; merged `bec01b64d2038c0bbb6b9b74f076f9c5c791d7db` with identical complete Git tree |
| Frontend quality | CI `37112655046`: 545 checks passed |
| Ordinary browsers | CI `37112655046`: 292 passed, two conditional zoom cases skipped; separate actual zoom gate passed |
| Focused browser checks | Six Guest-print, two Tenant Admin keyboard and two Employee draft cases passed |
| Actual tab zoom | Artifact `11271325196`; zoom 2, viewport 640, no horizontal overflow, keyboard navigation and Business help passed |
| API quality | CI `37112651747`: 883 unit/static checks and bounded Customer/Platform HTTP DAST passed |
| PostgreSQL 18 | CI `37112651747`: 117 tests across 50 files passed |
| Permanent acceptance | API CI passed all three customers and both reset cycles in Chromium and WebKit |
| Live schema/deployments | Schema 42; Customer `dep-db0csqnavr4c73f50nsg`, Platform `dep-db0csqnavr4c73f50ntg`, both LIVE on the merged API/checkpoint pair |
| Hosted identity/reset | Pending the exact new deployed pair |
| Three-origin ZAP | Run `37114246017`: all three surfaces passed on the exact new deployed pair |

The optional AI review did not execute because the service returned HTTP 402
for its monthly quota. Required CodeQL, dependency and secret gates remain
independent; no AI analysis or finding clearance is inferred.

## Migration and recovery boundary

Canonical migration 042 extends the permitted bulk-receipt aggregate types.
Its checksum is
`498589db222cb3559487315fdb0c074656239ef7706178c046bac9b345ce9e38`.
The recorded checksum must match the canonical migration ledger before
this record is promoted. Migration executes under an advisory lock in one
transaction after checking the complete predecessor ledger; business counts
must remain unchanged. Downgrade refuses while Equipment receipts remain.
Do not delete receipts or historical business records to bypass that guard.

## Accepted scope and remaining operational boundaries

Named Owner acceptance #172/#182 and bounded Demo recovery disposition #216
are completed. ADR-012's structured public Guest values and owning-role
withhold/correct policy remain binding; known credentials are not accepted.
The provider snapshot/database-byte recovery evidence does not prove isolated
HTTP restore, positive retention deletion, alert delivery, Production RPO/RTO
or a Production provider integration. Those limitations remain explicit.

Functional keyboard, focus, mobile reflow, DE/EN and actual 200% zoom evidence
does not constitute formal WCAG certification. Visually reviewed Guest PDFs
do not constitute tagged-PDF certification.

SaaS 3.9's delivered Gitlink and publication pipeline are preserved. Visibility
cutover #254 remains open. Closing SaaS 3.6 resolves its prerequisite for SaaS
4; it does not execute SaaS 4 work or authorize real provider orders.

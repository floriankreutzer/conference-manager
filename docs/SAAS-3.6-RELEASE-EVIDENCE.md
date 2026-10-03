# SaaS 3.6 release evidence

Status: **in validation**, 3 October 2026. This record does not authorize readiness
promotion or close #229/#169/#170/#164 until the remaining release gates pass.
Named Owner acceptance #172/#182 and the bounded Demo disposition #216 remain
completed and are not reopened by later correction or infrastructure work.

## Current continuation checkpoint

The reviewed SaaS 3.6 branch is reconciled with main commit
`48c04ba4363e5250d5f00dd012f3df78dc428383` (merged #261). The integration retains
website-owned EN/DE Demo launch routes, retired duplicate portal publication,
exact website DAST policy, the current Catering-panel wait and bounded deployed
identity diagnostics. It also retains #259's named references, native help,
Equipment/CSV contract, canonical reset map and stronger Contoso persistence
and media-detachment assertions. No application business code, seed, schema,
permission, readiness marker or deployed runtime pin is changed by this
integration. Its new head requires fresh checks; earlier green runs are not
presented as results for the new combined tree.

The earlier Neon quota outage is historical, not a currently assumed blocker.
A fresh project read on 3 October reports `launch_v3` for the existing Demo
project; Render logs at approximately 12:13 UTC show HTTP 200 on both readiness
paths and successful application reads. No tariff, resource limit or database
mutation was performed by this continuation. Health recovery does not prove
full scenario, reset or deployment-identity acceptance.

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

## Last completed pre-integration candidate evidence

These are historical, exact-candidate results recorded in #259, not acceptance
of an unexecuted successor. Fresh run links and outcomes belong in #259/#170.

| Evidence | Exact candidate/result |
| --- | --- |
| Frontend PR | #259; pre-integration head `ee9d6935e815f4a24deac89c9affcf8facec890b` |
| Immutable application checkpoint | `02ea3abce1c78798495519bbf4b5a50a44af961f` |
| API PR | #107; tested head `dc6c5ea7d4dc7b8fd279ea3bce9eb3f885b95c35`; merged `bec01b64d2038c0bbb6b9b74f076f9c5c791d7db` with identical complete Git tree |
| Frontend quality | CI `37116716177`: 545 checks passed |
| Ordinary browsers | CI `37116716177`: 292 passed; separate actual zoom gate passed |
| Focused browser checks | Guest-print, Tenant Admin keyboard and Employee draft cases passed |
| Actual tab zoom | Artifact `11271872374`; zoom 2, no horizontal overflow, keyboard navigation and Business help passed |
| API quality | CI `37112651747`: 883 unit/static checks and bounded Customer/Platform HTTP DAST passed |
| PostgreSQL 18 | CI `37112651747`: 117 tests across 50 files passed |
| Permanent acceptance | Full three-customer/two-reset acceptance passed in both engines in the pre-integration frontend and API CI |
| Recorded live schema/deployments | Schema 42; Customer `dep-db0csqnavr4c73f50nsg`, Platform `dep-db0csqnavr4c73f50ntg`, on the merged API/checkpoint pair |
| Last hosted attempt | `37116716181` failed: CSV/cross-role and Chromium scenario passed; WebKit final reset returned 503 during the Neon quota outage; independent cleanup/identity evidence was incomplete |
| Last pre-integration ZAP | `37116716201`: three surfaces passed on the pinned pair; current website-owned target requires the reconciled gate |

The optional AI review did not execute because its service returned HTTP 402
for its monthly quota. Required CodeQL, dependency and secret gates remain
independent; no AI analysis or finding clearance is inferred. This separate
service quota is not evidence that Neon is still suspended.

## Remaining release sequence

1. Pass the combined #259 head through quality/architecture/audit, ordinary and
   focused browser tests, actual 200% zoom and real PostgreSQL CSV plus the
   permanent three-customer/two-reset scenario in Chromium and WebKit.
2. Run exact-pair hosted acceptance only through the repository-wide serial
   queue. Preserve four 300-second CSV/cross-role cases, full scenarios,
   independent repeatable canonical cleanup and pre/post deployment identity.
   A failed or skipped required journey/cleanup is not acceptance.
3. Verify current website and both Render DAST surfaces, required security
   checks and unresolved review threads; merge #259 through protected main.
4. Complete the final paired readiness/deployment promotion with immutable
   counterpart refs, preserve the SaaS 3.9 Gitlink/publication boundary, and
   synchronize GitHub and Confluence with the executed final evidence.
5. Complete #229, #169, #170 and #164 only for their actually satisfied scope.
   Milestone 10 may close only when every scoped issue is completed and no
   additional open issue remains. SaaS 4 work is not executed by this closure.

## Migration and recovery boundary

Canonical migration 042 extends the permitted bulk-receipt aggregate types.
Its checksum is
`498589db222cb3559487315fdb0c074656239ef7706178c046bac9b345ce9e38`.
The recorded checksum must match the canonical migration ledger before
this record is promoted. The recorded migration used an advisory lock and
one transaction after checking the complete predecessor ledger; Tenant/Room/
receipt counts remained 3/12/0. Downgrade refuses while Equipment receipts
remain. Do not delete receipts or historical business records to bypass that
guard. This continuation does not repeat the already applied migration.

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

SaaS 3.9's delivered Gitlink and publication pipeline and #261's website
ownership are preserved. Visibility cutover #254 remains separate. SaaS 3.8
runtime-efficiency work remains separately reviewed; this integration does
not merge or deploy its pending API changes. Closing SaaS 3.6 resolves its
prerequisite for SaaS 4; it does not authorize real provider orders.

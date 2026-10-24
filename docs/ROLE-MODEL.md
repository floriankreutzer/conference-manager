# Canonical Customer Role Model

## Status

This document is the customer-facing authorization and ownership baseline for `SaaS 3.6 — Role Model, Security Regression & Documentation Baseline`.

The API remains the authorization authority. Frontend navigation and presentation capabilities may hide unavailable functions, but they MUST NOT be treated as authorization controls.

Platform Admin/operator authority is outside this customer Tenant role model.

## Effective roles

Every active customer User has the `employee` baseline. Elevated roles are independent and additive:

- `conference_manager`
- `tenant_admin`

A User may hold neither, either, or both elevated roles. A dual-role User receives the exact union of Employee, Conference Manager and Tenant Admin capabilities. `tenant_admin` never implicitly inherits `conference_manager`, and `conference_manager` never implicitly inherits `tenant_admin`.

Tenant role administration persists only elevated roles. The effective server Principal adds the implicit Employee baseline.

## Permission matrix

| Capability | Employee | Conference Manager | Tenant Admin | Dual role |
| --- | --- | --- | --- | --- |
| Read own Requests | Yes | Yes | Yes, through Employee baseline | Yes |
| Cancel own Requests | Yes | Yes | Yes, through Employee baseline | Yes |
| Delete own Requests | No | No | No | No |
| Read/manage Tenant-wide operational Requests | No | Yes | No | Yes |
| Approve operational Requests, including own eligible Requests | No | Yes | No | Yes |
| Manage Room business data | No | Yes | No | Yes |
| Manage Tenant Catalogue | No | Yes | No | Yes |
| Manage authoritative Room prices | No | Yes | No | Yes |
| Configure Tenant organization, booking policy and cost allocation | No | No | Yes | Yes |
| Manage Tenant Users and elevated roles | No | No | Yes | Yes |
| Configure provider integrations | No | No | Yes | Yes |
| Manage technical Room/provider mapping | No | No | Yes | Yes |
| Read Tenant audit administration | No | No | Yes | Yes |

Canonical permission identifiers:

- Employee: `request:read`, `request:cancel`
- Conference Manager: `request:manage`, `tenant:rooms:business:manage`, `tenant:catalogue:manage`
- Tenant Admin: `tenant:configure`, `tenant:users:manage`, `tenant:integrations:manage`, `tenant:audit:read`

## Room ownership boundary

Room data is intentionally split by field ownership.

Conference Manager owns business fields:

- `name`
- `description`
- `capacity`
- `active`
- `floor`
- `equipment`
- `accessibility`
- `serviceIds`
- `cateringPackageIds`
- `floorplanAssetId`
- `mediaAssetIds`

Tenant Admin owns the technical Location/provider shape:

- Site records and Site configuration
- Room stable identity
- Room-to-Site technical assignment (`siteId`)
- provider identity/resource reference and mapping through the provider integration services

The frontend projects each edit onto the current authoritative Location snapshot and preserves fields owned by the other role. The API independently reclassifies the mutation against the persisted authoritative snapshot. A mixed technical/business mutation requires both elevated roles.

## Catalogue ownership

Tenant Catalogue is Conference Manager-owned. It includes:

- services
- equipment catalogue entries
- catering items
- catering packages and variants
- authoritative Room prices

Tenant Admin does not receive Catalogue write authority merely because it can configure the Tenant. Provider-side Room identity and resource mapping is not Catalogue data and remains Tenant Admin-owned.

## Demo personas

Customer Demo uses the same effective role contract as Production, but only with synthetic Demo identities and server-issued Demo sessions.

Available personas:

- `employee`
- `conference_manager`
- `tenant_admin`
- `dual_role`

`dual_role` is a derived Demo persona. It is not an additional persisted authorization role. The Demo server issues the canonical role/permission union, and the frontend rejects a persona whose returned roles/permissions do not match the canonical Production session contract.

## Security invariants

- Server-side authorization is deny-by-default.
- Tenant identity is server-derived and cannot be selected by client payloads.
- Tenant-scoped object access is enforced server-side to prevent BOLA/cross-Tenant access.
- Browser storage, query parameters, DOM state and Demo selectors are never authorization authority.
- Role changes invalidate stale server sessions through `security_version` semantics.
- The inactivity lock is additive UI protection only; unlock revalidates the server session and never restores stale browser authority.
- Customer and Platform Admin security domains remain separate.

## Independent role sources (source candidate)

When the trusted API supplies role provenance, effective elevated roles are the
union of direct assignments and Microsoft-group grants. The User form edits only
direct assignments and displays Microsoft-group roles separately as read-only
source information. Saving or removing a direct assignment never copies or clears
a group grant. Response validation rejects unknown roles, unexpected provenance
fields and a union inconsistent with the effective role snapshot. Employee remains
implicit. Older responses without provenance retain their direct-only presentation.
No browser value establishes group authority; approved provider mapping and
synchronization still belong to the API. Source implementation and fixture/browser
evidence are distinct from actual protected provider and live acceptance.

## Microsoft mapping administration (source candidate)

The User section reads the server's optional Microsoft-role mapping capability.
For an authorized REAL Tenant Admin, it edits an exact directory-ID/group-ID/role
mapping and submits the expected server revision through existing CSRF transport.
It never submits a Tenant, User, provider observation or effective role grant.
Group UUIDs require explicit elevated-role selection; no baseline or Platform role
is selectable. A 403/404 hides this unavailable capability while preserving User
administration. Conflicts require an explicit reload/review; writes are not retried
automatically. Drafts remain in memory across section rerenders/language changes,
with no browser storage or authority. Detached/stale views ignore late responses.

Saving a mapping revokes existing derived sources until fresh Microsoft sign-in.
Changing mappings requires an active directly assigned Tenant Admin for recovery. Direct grants
remain independent. Verified group rights expire after at most one hour, including
email-code sessions; the server owns expiry, mapping approval, source reconciliation
and audit. Provider overage or missing claims grant no group authority. Synthetic
provider/browser fixtures do not establish actual Microsoft or live acceptance.

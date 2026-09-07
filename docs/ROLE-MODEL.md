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

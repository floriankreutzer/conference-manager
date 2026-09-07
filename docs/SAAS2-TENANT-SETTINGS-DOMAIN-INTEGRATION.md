# SaaS 2 tenant settings domain integration manifest

## Status and Roadmap Version 11 amendment

This document is the historical integration manifest for the SaaS 2 domain package. Roadmap Approved Version 11 (2026-09-01), roadmap issue #164 and role-model issue #166 supersede its original assumption that all five domains are composed into Tenant Admin. The current normative ownership contract is `docs/ROLE-MODEL.md`.

The current composition applies these boundaries:

- Organization, Booking Policies and Cost Allocation are Tenant Admin capabilities requiring their exact server-issued Tenant Admin permissions;
- the Location adapter is shared at the Composition Root, but Tenant Admin receives only Site/technical Room/provider presentation while Conference Manager receives Room-business presentation;
- Catalogue, including authoritative Room prices, is composed only for Conference Manager with `tenant:catalogue:manage`; Tenant Admin alone must neither read nor mutate it; and
- a dual-role User receives both independently authorized surfaces as the exact permission union.

The historical snippets below are retained to explain the SaaS 2 delivery and must not be applied as current composition instructions. Their adapter, Production/Demo separation, bounded-wire-contract and private-section rules remain useful only where they do not conflict with the Version 11 ownership amendment.

The domain package was developed without touching shared composition files, then integrated on the exact SaaS 2 settings-revision foundation commit `7db3c83df53ac128d8dcab82f0603c8bbb95b9b6`. That foundation includes the asynchronous settings-focus regression and both final conflict-heading corrections.

## Historically delivered public contracts

| Section adapter key | Demo factory exported by section `index.js` | Production factory | Confirmed wire path (the shared API client adds `/api/`) |
| --- | --- | --- | --- |
| `organization` | `createDemoOrganizationSettings` | `createTenantOrganizationSettingsApi` | `v1/tenant/settings/organization` |
| `locations` | `createDemoLocationSettings` | `createTenantLocationSettingsApi` | `v1/tenant/settings/locations` |
| `catalog` | `createDemoCatalogueSettings` | `createTenantCatalogueSettingsApi` | `v1/tenant/settings/catalogue` |
| `bookingPolicies` | `createDemoBookingPolicySettings` | `createTenantBookingPolicySettingsApi` | `v1/tenant/settings/booking-policies` |
| `costAllocation` | `createDemoCostAllocationSettings` | `createTenantCostAllocationSettingsApi` | `v1/tenant/settings/cost-allocation` |

All writes pass `method` and a bounded body to the existing authenticated API client. That client remains the single owner of credentials, same-origin enforcement, CSRF headers, and normalized HTTP errors. No Production adapter falls back to Demo data or browser persistence.

## Historical root integration

The SaaS 2 integration branch applied the following bounded root changes. They are historical delivery evidence, not the current role-aware Composition Root recipe.

1. In `src/core/i18n.js`, import the new domain catalogue:

   ```js
   import { TENANT_SETTINGS_DOMAIN_MESSAGES } from './i18n-tenant-settings-domain-messages.js';
   ```

   At the beginning of `capabilityTemplate`, before the existing Tenant Admin catalogue lookup, add:

   ```js
   const tenantSettingsDomainMessages = TENANT_SETTINGS_DOMAIN_MESSAGES[targetLanguage]
     ?? TENANT_SETTINGS_DOMAIN_MESSAGES.de;
   if (tenantSettingsDomainMessages?.[key] !== undefined) return tenantSettingsDomainMessages[key];
   ```

   Extend `scripts/check-i18n.mjs` through its normal catalogue parser/merge path so the new file is a canonical synchronized catalogue. Keep `tests/tenant-settings-domain-messages.test.js` as the focused regression check.

2. Expose the five Production factories through the approved Platform facade `src/platform/tenant-settings-api.js`, then import that facade in `src/app.js`:

   ```js
   import {
     createTenantBookingPolicySettingsApi,
     createTenantCatalogueSettingsApi,
     createTenantCostAllocationSettingsApi,
     createTenantLocationSettingsApi,
     createTenantOrganizationSettingsApi,
   } from './platform/tenant-settings-api.js';
   ```

   Re-export the Demo factories through the Tenant Admin public facade and import them only from that facade:

   ```js
   import {
     createDemoBookingPolicySettings,
     createDemoCatalogueSettings,
     createDemoCostAllocationSettings,
     createDemoLocationSettings,
     createDemoOrganizationSettings,
   } from './tenant-admin/index.js';
   ```

   Do not import section directories or `demo-adapter.js` private paths from the Composition Root.

3. After `authentication` is resolved in `bootstrap`, create settings adapters with one explicit runtime branch:

   ```js
   const tenantSettingsAdapters = context.isDemoRuntime()
     ? Object.freeze({
       organization: createDemoOrganizationSettings(),
       locations: createDemoLocationSettings(),
       catalog: createDemoCatalogueSettings(),
       bookingPolicies: createDemoBookingPolicySettings(),
       costAllocation: createDemoCostAllocationSettings(),
     })
     : (context.isTenantAdmin() && authentication
       ? Object.freeze({
         organization: createTenantOrganizationSettingsApi({ apiClient: authentication.apiClient }),
         locations: createTenantLocationSettingsApi({ apiClient: authentication.apiClient }),
         catalog: createTenantCatalogueSettingsApi({ apiClient: authentication.apiClient }),
         bookingPolicies: createTenantBookingPolicySettingsApi({ apiClient: authentication.apiClient }),
         costAllocation: createTenantCostAllocationSettingsApi({ apiClient: authentication.apiClient }),
       })
       : Object.freeze({}));
   ```

   Spread `tenantSettingsAdapters` into the existing `sectionAdapters` object before `users` and `microsoft365`. Do not add a fallback when an authenticated Production adapter is unavailable; an unavailable adapter intentionally hides that section.

4. `src/tenant-admin/section-registry.js` already maps the exact keys above. No registry change is required. `src/tenant-admin/application.js` also requires no change.

5. No new CSS is required for these five settings domains. The sections use existing `card`, `form-grid`, `field`, `button-row`, `muted`, validation, status, and focus patterns. The domain-only integration advanced the build/cache marker to `.72`; the combined operations integration advanced it to `.73`; effective Tenant presentation advances the shared marker to `.74` for the reviewed shell branding and reflow rules.

## Backend contract reconciliation

- Organization and catalogue match backend package `80d073000ac3c182dfe637967c419e4f4451bde5`: direct `{schemaVersion, revision, organization|catalogue}` envelopes, `expectedRevision` writes, and paged history. Catalogue uses British spelling in paths and payloads.
- At the SaaS 2 integration point, Locations matched backend PR 40: `{locations:{schemaVersion,revision,configuration,providerContext}}`, metadata-only history, revision reads, and rollback. `providerContext` contained no provider object ID, email address, or provider address and was never included in a write body. Under Version 11, the single-role Tenant Admin surface treats mixed-ownership history as metadata and does not expose rollback; a mixed technical/business mutation requires the exact dual-role permission union and backend field classification.
- Booking policies match backend package `ba44e84f979bf2ab5832a7042a1419310e5ac4aa`: `{bookingPolicies:{schemaVersion,revision,configuration}}`, versioned effective dates, metadata history, and revision reads. Already-effective versions are disabled in the UI and retained unchanged.
- Cost allocation matches backend package `ba44e84f979bf2ab5832a7042a1419310e5ac4aa`: route `v1/tenant/settings/cost-allocation`, wrapper key `costAllocation`, `{allocationRequired,costCenters}` configuration, metadata history, and revision reads.
- The cost allocation helper and Demo fixture use only `percentage_basis_points`. Non-empty allocations must contain unique active cost centers and total exactly 10,000 basis points (100%). No fixed-amount or browser-authoritative allocation model is present.
- Organization branding accepts only `null` or the exact reviewed reference `managed-brand:conference-manager-mark-v1`. The form exposes a bounded native picker rather than a raw reference field. Server-side Tenant authorization remains mandatory; uploads, remote URLs and custom styles are not part of the browser contract.
- IDs shown for local configuration records are immutable. Microsoft provider technical IDs never enter the browser response contract and therefore cannot be displayed or edited.

## Demo contract

At the SaaS 2 integration point, each domain owned a separate in-memory adapter and fixture. `reset({scenario})` supported `normal`, `empty`, `conflict`, `history`, and `recovery`, restored the authoritative revision to `1`, and returned `1`. Conflict scenarios advanced the authoritative revision before returning the exact shared `HTTP_409` / `TENANT_SETTINGS_REVISION_CONFLICT` contract. Recovery failed exactly once, then succeeded. History used fixed timestamps and actors. Those historical adapters contained no network, storage, real Tenant data, provider address or Production import. ADR-010 and its completed shared-Demo migration supersede any implication that an in-memory adapter is active authoritative Demo business state.

## Historical integration validation and current re-proof

The repository commands remain applicable to any integrated branch:

```bash
npm run check
npm run audit
npm run test:e2e
```

Current Version 11 verification must use separate Production sessions: Tenant Admin must cover Organization, technical Locations, Booking Policies and Cost Allocation without reading or writing Catalogue or Room-business fields; Conference Manager must cover Room business and Catalogue without receiving technical/provider authority; and dual role must prove only the exact union. Across the applicable merged backend routes, also verify malformed-response rejection, stale-revision conflict and deliberate reapply, cross-Tenant denial, same-Tenant managed-brand authorization, provider-context redaction, past-policy immutability, archived-cost-center rejection and exact-100-percent allocation validation. Historical mixed Location revisions must remain non-actionable in each single-role surface.

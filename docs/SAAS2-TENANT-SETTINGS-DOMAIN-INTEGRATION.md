# SaaS 2 tenant settings domain integration manifest

The domain package was developed without touching shared composition files, then integrated on the exact SaaS 2 settings-revision foundation commit `7db3c83df53ac128d8dcab82f0603c8bbb95b9b6`. That foundation includes the asynchronous settings-focus regression and both final conflict-heading corrections.

## Delivered public contracts

| Section adapter key | Demo factory exported by section `index.js` | Production factory | Confirmed wire path (the shared API client adds `/api/`) |
| --- | --- | --- | --- |
| `organization` | `createDemoOrganizationSettings` | `createTenantOrganizationSettingsApi` | `v1/tenant/settings/organization` |
| `locations` | `createDemoLocationSettings` | `createTenantLocationSettingsApi` | `v1/tenant/settings/locations` |
| `catalog` | `createDemoCatalogueSettings` | `createTenantCatalogueSettingsApi` | `v1/tenant/settings/catalogue` |
| `bookingPolicies` | `createDemoBookingPolicySettings` | `createTenantBookingPolicySettingsApi` | `v1/tenant/settings/booking-policies` |
| `costAllocation` | `createDemoCostAllocationSettings` | `createTenantCostAllocationSettingsApi` | `v1/tenant/settings/cost-allocation` |

All writes pass `method` and a bounded body to the existing authenticated API client. That client remains the single owner of credentials, same-origin enforcement, CSRF headers, and normalized HTTP errors. No Production adapter falls back to Demo data or browser persistence.

## Applied root integration

The integration branch applies the following bounded root changes. They remain the reference when reconciling later Tenant Admin operations work.

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
- Locations match backend PR 40: `{locations:{schemaVersion,revision,configuration,providerContext}}`, metadata-only history, revision reads, and rollback. `providerContext` contains no provider object ID, email address, or provider address. It is never included in a write body.
- Booking policies match backend package `ba44e84f979bf2ab5832a7042a1419310e5ac4aa`: `{bookingPolicies:{schemaVersion,revision,configuration}}`, versioned effective dates, metadata history, and revision reads. Already-effective versions are disabled in the UI and retained unchanged.
- Cost allocation matches backend package `ba44e84f979bf2ab5832a7042a1419310e5ac4aa`: route `v1/tenant/settings/cost-allocation`, wrapper key `costAllocation`, `{allocationRequired,costCenters}` configuration, metadata history, and revision reads.
- The cost allocation helper and Demo fixture use only `percentage_basis_points`. Non-empty allocations must contain unique active cost centers and total exactly 10,000 basis points (100%). No fixed-amount or browser-authoritative allocation model is present.
- Organization branding accepts only `null` or the exact reviewed reference `managed-brand:conference-manager-mark-v1`. The form exposes a bounded native picker rather than a raw reference field. Server-side Tenant authorization remains mandatory; uploads, remote URLs and custom styles are not part of the browser contract.
- IDs shown for local configuration records are immutable. Microsoft provider technical IDs never enter the browser response contract and therefore cannot be displayed or edited.

## Demo contract

Each domain owns a separate in-memory adapter and fixture. `reset({scenario})` supports `normal`, `empty`, `conflict`, `history`, and `recovery`, always restores the authoritative revision to `1`, and returns `1`. Conflict scenarios advance the authoritative revision before returning the exact shared `HTTP_409` / `TENANT_SETTINGS_REVISION_CONFLICT` contract. Recovery fails exactly once, then succeeds. History uses fixed timestamps and actors. Demo modules contain no network, storage, real tenant data, provider address, or Production import.

## Final integration validation

Run from the repository root on the integrated branch:

```bash
npm run check
npm run audit
npm run test:e2e
```

Additionally verify a Production tenant-admin session against each merged backend route, including malformed response rejection, stale-revision conflict and deliberate reapply, cross-tenant denial, same-tenant managed-brand authorization, provider-context redaction, past-policy immutability, archived cost-center rejection, and exact-100-percent allocation validation.

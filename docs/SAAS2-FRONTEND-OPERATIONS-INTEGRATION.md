# SaaS 2 frontend operations integration manifest

The isolated operations package commit `95a9f692b1ba7a1ff7009e735a9f7c0342a3c1da` deliberately left shared composition surfaces unchanged. The root integration applies it after the settings-domain integration commit `a7cc669bdb966d0a310642f554f13f993180eafd` and records the final shared changes below.

## Core localization

The root integration updates `src/core/i18n.js` to:

1. Import `TENANT_ADMIN_OPERATIONS_MESSAGES` from
   `./i18n-tenant-admin-operations-messages.js`.
2. In `capabilityTemplate`, resolve the operations catalogue before the general capability
   catalogue. The settings and onboarding catalogues can retain their existing order because the
   operations keys have the unique `tenantAdmin.operations.` prefix.
3. Extend the canonical i18n governance check to include this catalogue in addition to retaining
   `tests/tenant-admin-operations.test.js` as focused key/placeholder parity coverage.

The lookup added to `capabilityTemplate` is:

```js
const operationsMessages = TENANT_ADMIN_OPERATIONS_MESSAGES[targetLanguage]
  ?? TENANT_ADMIN_OPERATIONS_MESSAGES.de;
if (operationsMessages?.[key] !== undefined) return operationsMessages[key];
```

## Composition root

The root integration exposes Production operations through `src/platform/tenant-admin-operations-api.js`, exposes Demo operations through `src/tenant-admin/index.js`, and imports only those approved facades from `src/app.js`:

1. Import `createTenantAuditApi` and `createTenantCapabilitiesApi` from
   `./platform/tenant-admin-operations-api.js`.
2. Import `createDemoTenantAudit` and `createDemoTenantCapabilities` from
   `./tenant-admin/index.js`.
3. Compose the two new ports from the already selected runtime. Production must never fall back
   to Demo when authentication or a request fails.

```js
const tenantAudit = context.isDemoRuntime()
  ? createDemoTenantAudit()
  : (context.isTenantAdmin() && authentication
    ? createTenantAuditApi({ apiClient: authentication.apiClient })
    : null);
const tenantCapabilities = context.isDemoRuntime()
  ? createDemoTenantCapabilities()
  : (context.isTenantAdmin() && authentication
    ? createTenantCapabilitiesApi({ apiClient: authentication.apiClient })
    : null);
```

Add the ports to the existing explicit `sectionAdapters` object:

```js
audit: tenantAudit,
capabilities: tenantCapabilities,
```

No change is required in `src/tenant-admin/application.js` or
`src/tenant-admin/section-registry.js`; both sections are already registered and accept the named
ports. No extra Microsoft 365 port is required: the existing production connection factory and
Demo onboarding factory now expose `getOperations` and `synchronizeMappings` on the same injected
runtime.

## Styles and cache markers

The integration adds the following import after `tenant-admin-settings.css` in `assets/app-layout.css`:

```css
@import url('./tenant-admin-operations.css');
```

The final combined build uses `APP_BUILD` `2026.08.27.73`, `src/app.js?v=20260827-73`, and `assets/app-layout.css?v=20260827-73`.

## Integration validation

After composition, run:

```text
npm run check
npm run audit
npm run test:e2e -- tests/e2e/tenant-role-administration.spec.js
```

Production fixtures must return the exact backend envelopes, including a canonical UUID
`requestId`. Microsoft 365 operational fixtures must include the three bounded connection-health
capabilities added by the existing decorated connection service.

## Backend contract resolution for issue #87

No replacement issue-#87 endpoint was present in the approved sources. The package therefore reuses the established, tenant-scoped SaaS 1 contracts rather than inventing a parallel endpoint:

- `GET /api/v1/integrations/microsoft365`;
- `GET /api/v1/integrations/microsoft365/room-mappings`;
- `POST /api/v1/integrations/microsoft365/room-mappings/sync`;
- `GET /api/v1/integrations/microsoft365/pilot-readiness`.

The connection response must be produced by the existing health-decorated service and contain
`places`, `freeBusy`, and `calendarWrite`. Provider tenant identifiers, provider object IDs,
resource addresses, credentials, and raw error details are validated at the Platform boundary and
are not copied into the operations view model.

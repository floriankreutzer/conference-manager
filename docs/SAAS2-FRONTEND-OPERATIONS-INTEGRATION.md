# SaaS 2 frontend operations integration manifest

## Status and current composition

This document preserves the historical SaaS 2 operations integration. The in-memory Demo recipe and build markers below are delivery history, not current composition instructions. [ADR-010](ADR-010-SHARED-SERVER-BACKED-DEMO-RUNTIME.md), [Architecture](ARCHITECTURE.md) and the [role model](ROLE-MODEL.md) describe the current runtime and ownership.

The current entry points compose the shared `bootstrapCustomerApplication` in [`src/app.js`](../src/app.js):

- authenticated Tenant Admin sessions use `createTenantAuditApi` and `createTenantCapabilitiesApi` from the approved Platform facade in both Customer Demo and Production;
- [`src/platform/demo-bootstrap.js`](../src/platform/demo-bootstrap.js) injects Demo session establishment and the Demo Microsoft 365 connection adapter; settings, Users, audit, capabilities and effective presentation use the shared server-backed contracts;
- PostgreSQL owns Demo business state. A failed API read does not activate an in-memory operations fixture or browser-owned authority;
- Tenant Admin and Conference Manager remain independent roles. Operations composition does not grant Tenant Admin Room-business or Catalogue authority;
- protected synthetic onboarding is a separate, explicitly injected runtime described in [Protected synthetic onboarding](PROTECTED-SYNTHETIC-ONBOARDING.md). Its evidence and shared-Demo simulation do not establish real Microsoft/Exchange acceptance.

Current validation follows root `AGENTS.md`, the configured CI gates and the permanent [three-customer scenario contract](SAAS-3.7-SCENARIO-ACCEPTANCE.md). Historical focused commands below do not replace those gates or prove deployed provider behavior.

## Historical integration baseline

The isolated operations package commit `95a9f692b1ba7a1ff7009e735a9f7c0342a3c1da` deliberately left shared composition surfaces unchanged. The root integration applied it after the settings-domain integration commit `a7cc669bdb966d0a310642f554f13f993180eafd` and recorded the shared changes below.

## Historical core localization

The root integration updated `src/core/i18n.js` to:

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

## Historical composition root

The original root integration exposed Production operations through `src/platform/tenant-admin-operations-api.js` and in-memory Demo operations through `src/tenant-admin/index.js`. Its superseded composition recipe was:

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

The integration added the ports to the explicit `sectionAdapters` object:

```js
audit: tenantAudit,
capabilities: tenantCapabilities,
```

No change was required in `src/tenant-admin/application.js` or
`src/tenant-admin/section-registry.js`; both sections were already registered and accepted the named
ports. No extra Microsoft 365 port was required: the connection factories exposed `getOperations`
and `synchronizeMappings` on the injected runtime. The current factories and server-backed
composition are the ones described above.

## Historical styles and cache markers

The integration added the following import after `tenant-admin-settings.css` in `assets/app-layout.css`:

```css
@import url('./tenant-admin-operations.css');
```

That combined build used `APP_BUILD` `2026.08.27.73`, `src/app.js?v=20260827-73`, and `assets/app-layout.css?v=20260827-73`. These are historical markers, not current release identifiers.

## Historical integration validation

The original integration used these focused commands:

```text
npm run check
npm run audit
npm run test:e2e -- tests/e2e/tenant-role-administration.spec.js
```

Production fixtures must return the exact backend envelopes, including a canonical UUID
`requestId`. Microsoft 365 operational fixtures must include the three bounded connection-health
capabilities added by the existing decorated connection service.

## Historical backend contract resolution for issue #87

No replacement issue-#87 endpoint was present in the approved sources. The package therefore reuses the established, tenant-scoped SaaS 1 contracts rather than inventing a parallel endpoint:

- `GET /api/v1/integrations/microsoft365`;
- `GET /api/v1/integrations/microsoft365/room-mappings`;
- `POST /api/v1/integrations/microsoft365/room-mappings/sync`;
- `GET /api/v1/integrations/microsoft365/pilot-readiness`.

The connection response must be produced by the existing health-decorated service and contain
`places`, `freeBusy`, and `calendarWrite`. Provider tenant identifiers, provider object IDs,
resource addresses, credentials, and raw error details are validated at the Platform boundary and
are not copied into the operations view model.

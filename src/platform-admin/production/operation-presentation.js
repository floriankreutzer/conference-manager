import { PLATFORM_RECOVERY_DEFINITIONS } from '../resource-contracts.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES=['employee','conference_manager','tenant_admin'];
const SLOTS=['northwind','contoso','fabrikam'];
const LIFECYCLE_ACTIONS=Object.freeze({ ready: 'customerReady',active: 'customerActivate',suspended: 'customerSuspend',archived: 'customerArchive' });
const RECOVERY_IDS=new Set(PLATFORM_RECOVERY_DEFINITIONS.map(definition=>definition.id));
const safeName=value=>typeof value==='string' && value.trim()===value && value.length>0 && value.length<=200
  && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;

// Presentation only: names come from validated directory/intent results. No
// descriptor authorizes an action or participates in the server's proof binding.
export function createPlatformOperationPresentation() {
  const names=new Map();
  function rememberTenants(tenants) {
    for (const tenant of tenants) {
      const id=tenant.id ?? tenant.tenantId,name=safeName(tenant.displayName);
      if (!UUID.test(id ?? '') || !name) continue;
      names.delete(id.toLowerCase());names.set(id.toLowerCase(),name);
      if (names.size>200) names.delete(names.keys().next().value);
    }
  }
  function describe(url,init) {
    const path=new URL(url).pathname.replace(/^\/api\/v1\/platform\//,'');
    let body={};
    if (typeof init.body==='string' && init.body.length<=16384) {
      try { body=JSON.parse(init.body) ?? {}; } catch {}
    }
    const match=path.match(/^tenants\/([a-f0-9-]{36})\/(.+)$/i);
    const tenantId=match && UUID.test(match[1]) ? match[1].toLowerCase() : null;
    const context={ action: 'operation',target: tenantId ? 'customer' : 'platform',tenantId,
      displayName: tenantId ? names.get(tenantId) ?? null : null,role: null,slot: null,recoveryId: null };
    const suffix=match?.[2];
    const recovery=suffix?.match(/^recovery\/([^/]+)\/(targets|previews|executions)$/);
    if (path==='tenants' && init.method==='POST') {
      context.action='customerCreate';context.target='customer';context.displayName=safeName(body.displayName);
    } else if (suffix==='lifecycle/transitions' && init.method==='POST') {
      context.action=Object.hasOwn(LIFECYCLE_ACTIONS,body.targetStatus) ? LIFECYCLE_ACTIONS[body.targetStatus] : 'operation';
    } else if (['GET','POST','DELETE'].includes(init.method) && /^invitations(?:\/[a-f0-9-]{36}(?:\/reissue)?)?$/i.test(suffix ?? '')) {
      context.action=init.method==='GET' ? 'invitationRead' : init.method==='DELETE' ? 'invitationRevoke'
        : suffix.endsWith('/reissue') ? 'invitationReissue' : 'invitationCreate';
    } else if (init.method==='POST' && suffix==='entitlement-previews' || init.method==='GET' && suffix?.startsWith('package-previews/')) context.action='entitlementPreview';
    else if (init.method==='POST' && /^(?:entitlement|package)-applications(?:\/|$)/.test(suffix ?? '')) context.action='entitlementApply';
    else if (init.method==='POST' && suffix?.startsWith('quotas/')) context.action='quotaUpdate';
    else if (init.method==='GET' && suffix?.startsWith('diagnostics/correlations/')) context.action='correlationRead';
    else if (recovery && RECOVERY_IDS.has(recovery[1]) && (init.method==='GET' && recovery[2]==='targets'
      || init.method==='POST' && ['previews','executions'].includes(recovery[2]))) {
      context.action=({ targets: 'recoveryTargets',previews: 'recoveryPreview',executions: 'recoveryExecute' })[recovery[2]];
      context.recoveryId=recovery[1];
    } else if (init.method==='GET' && path==='audit/exports') context.action='auditExport';
    else if (init.method==='POST' && path==='synthetic/generation/options') { context.action='demoReplace';context.target='demo'; }
    else if (init.method==='POST' && path==='auth/delegation/options' && SLOTS.includes(body.slot) && ROLES.includes(body.role)) {
      context.action='customerAccess';context.target='demo';context.slot=body.slot;context.role=body.role;
    } else if (init.method==='POST' && path==='auth/owner/options' && UUID.test(body.tenantId ?? '') && ROLES.includes(body.role)) {
      context.action='customerAccess';context.target='customer';context.tenantId=body.tenantId.toLowerCase();
      context.displayName=names.get(context.tenantId) ?? null;context.role=body.role;
    }
    // Capture before queueing; later directory, route or language changes cannot
    // replace this request's target. Never retain body/reason/recipient/proof.
    return Object.freeze(context);
  }
  return Object.freeze({ describe,rememberTenants,clear() { names.clear(); } });
}

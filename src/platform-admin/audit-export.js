import { normalizePlatformAuditPage } from './resource-contracts.js';

// The existing API/proof port owns scope and step-up. Download only the bounded
// current-segment response, including the explicit unverifiable legacy context.
export async function downloadPlatformAuditExport(dataSource) {
  const result=normalizePlatformAuditPage(await dataSource.loadAudit({ limit: 100,exportView: true }));
  if (result.schemaVersion!==2) throw new TypeError('PLATFORM_AUDIT_SEGMENT_REQUIRED');
  const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{ type: 'application/json' }));
  const link=document.createElement('a');link.href=url;link.download='platform-audit-current-segment.json';
  try { document.body.append(link);link.click(); }
  finally { link.remove();setTimeout(()=>URL.revokeObjectURL(url),0); }
}

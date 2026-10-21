const ASSET_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const KEYS=['altText','contentType','id','ownerId','ownerKind','url'];

export function normalizeCatalogueMediaResponse(response) {
  if (!response || typeof response!=='object' || !Array.isArray(response.assets) || response.assets.length>40) {
    throw new TypeError('CATALOGUE_MEDIA_RESPONSE_INVALID');
  }
  const seen=new Set(),owners=new Set();
  return Object.freeze(response.assets.map(asset=>{
    if (!asset || typeof asset!=='object' || Array.isArray(asset)
      || Object.getPrototypeOf(asset)!==Object.prototype || Object.keys(asset).sort().join(',')!==KEYS.join(',')
      || KEYS.some(key=>!Object.hasOwn(Object.getOwnPropertyDescriptor(asset,key) ?? {},'value'))) {
      throw new TypeError('CATALOGUE_MEDIA_RESPONSE_INVALID');
    }
    const owner=`${asset.ownerKind}:${asset.ownerId}`;
    if (typeof asset.id!=='string' || !ASSET_ID.test(asset.id) || seen.has(asset.id.toLowerCase()) || owners.has(owner)
      || !['room_plan','catering_package','catering_item'].includes(asset.ownerKind)
      || typeof asset.ownerId!=='string' || !OWNER_ID.test(asset.ownerId)
      || !['image/png','image/webp'].includes(asset.contentType)
      || typeof asset.altText!=='string' || asset.altText.length>160
      || asset.url!==`/api/v1/tenant/catalogue-media/${asset.id}`) {
      throw new TypeError('CATALOGUE_MEDIA_RESPONSE_INVALID');
    }
    seen.add(asset.id.toLowerCase());owners.add(owner);return Object.freeze({ ...asset });
  }));
}

export function createCatalogueMediaApi({ apiClient,timeoutMs=10000 }={}) {
  if (typeof apiClient?.request!=='function' || !Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>15000) {
    throw new TypeError('CATALOGUE_MEDIA_API_CONFIGURATION_INVALID');
  }
  const request=apiClient.request.bind(apiClient);
  return Object.freeze({ async list() {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try { return normalizeCatalogueMediaResponse(await request('v1/tenant/catalogue-media',{ signal: controller.signal })); }
    finally { clearTimeout(timer); }
  } });
}

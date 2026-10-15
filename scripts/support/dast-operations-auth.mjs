// This credential opens only the temporary Operations Demo perimeter.
// It does not create an application session or grant a business role.
export const DAST_OPERATIONS_ORIGIN = 'https://conference-manager-ops-demo.onrender.com';

export function readDastOperationsPassword(env = process.env) {
  const password = env.DAST_OPERATIONS_PASSWORD || '';
  if ((password && !/^[A-Za-z0-9_-]{43}$/.test(password))
    || (!password && env.DAST_OPERATIONS_REQUIRED === '1')) {
    throw new Error('DAST_OPERATIONS_CREDENTIAL_INVALID');
  }
  return password;
}

export function dastCredentialVariants(env = process.env) {
  const password = readDastOperationsPassword(env);
  if (!password) return [];
  return [password, Buffer.from(`ops:${password}`).toString('base64')];
}

export function createDastMetadataFetch({ origin, fetchImpl, env = process.env }) {
  const password = readDastOperationsPassword(env);
  if (!password || origin !== DAST_OPERATIONS_ORIGIN) return fetchImpl;
  const authorization = `Basic ${Buffer.from(`ops:${password}`).toString('base64')}`;
  return async (url, options = {}) => {
    // Bind before constructing headers; redirects must never forward the secret.
    if (url !== `${DAST_OPERATIONS_ORIGIN}/assets/hosted-demo-deployment.json`
      || options.redirect !== 'error'
      || (options.method && options.method !== 'GET')) {
      throw new Error('DAST_OPERATIONS_REQUEST_REJECTED');
    }
    const headers = new Headers(options.headers);
    if (headers.has('authorization') || headers.has('host') || headers.has('proxy-authorization')) {
      throw new Error('DAST_OPERATIONS_REQUEST_REJECTED');
    }
    headers.set('Authorization', authorization);
    try {
      return await fetchImpl(url, { ...options, headers });
    } catch {
      throw new Error('DAST_OPERATIONS_REQUEST_FAILED');
    }
  };
}

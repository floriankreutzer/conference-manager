import { pathToFileURL } from 'node:url';

const CUSTOMER_ORIGIN = 'https://conference-manager-demo.onrender.com';
const PLATFORM_ORIGIN = 'https://conference-manager-ops-demo.onrender.com';
const METADATA_PATH = '/assets/hosted-demo-deployment.json';
const COMMIT_REF_PATTERN = /^[0-9a-f]{40}$/;
const EXPECTED_REPOSITORY = 'floriankreutzer/conference-manager-api';
const EXPECTED_BRANCH = 'main';
const SERVICES = Object.freeze([
  Object.freeze({ origin: CUSTOMER_ORIGIN, serviceName: 'conference-manager-demo' }),
  Object.freeze({ origin: PLATFORM_ORIGIN, serviceName: 'conference-manager-ops-demo' }),
]);
const METADATA_KEYS = Object.freeze([
  'branch',
  'frontendRef',
  'provider',
  'repository',
  'runtimeRef',
  'schemaVersion',
  'serviceName',
]);

function requireCommitRef(value, code) {
  if (typeof value !== 'string' || !COMMIT_REF_PATTERN.test(value)) throw new Error(code);
  return value;
}

function requireOrigins(customerOrigin, platformOrigin) {
  if (customerOrigin !== CUSTOMER_ORIGIN || platformOrigin !== PLATFORM_ORIGIN) {
    throw new Error('HOSTED_DEMO_DEPLOYMENT_ORIGIN_INVALID');
  }
}

async function readMetadata(fetchImpl, service) {
  const response = await fetchImpl(`${service.origin}${METADATA_PATH}`, {
    redirect: 'error',
    headers: { Accept: 'application/json' },
  });
  const contentType = response.headers.get('content-type') || '';
  if (response.status !== 200 || !contentType.startsWith('application/json')) {
    throw new Error('HOSTED_DEMO_DEPLOYMENT_METADATA_RESPONSE_INVALID');
  }
  const metadata = await response.json();
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('HOSTED_DEMO_DEPLOYMENT_METADATA_INVALID');
  }
  const keys = Object.keys(metadata).sort();
  if (keys.length !== METADATA_KEYS.length || keys.some((key, index) => key !== METADATA_KEYS[index])) {
    throw new Error('HOSTED_DEMO_DEPLOYMENT_METADATA_INVALID');
  }
  return metadata;
}

function assertMetadata(metadata, service, expectedRuntimeRef, expectedFrontendRef) {
  if (
    metadata.schemaVersion !== 1
    || metadata.provider !== 'render'
    || metadata.repository !== EXPECTED_REPOSITORY
    || metadata.branch !== EXPECTED_BRANCH
    || metadata.serviceName !== service.serviceName
    || metadata.runtimeRef !== expectedRuntimeRef
    || metadata.frontendRef !== expectedFrontendRef
  ) throw new Error('HOSTED_DEMO_DEPLOYMENT_IDENTITY_MISMATCH');
}

export async function verifyHostedDemoDeployment({
  fetchImpl = fetch,
  customerOrigin = process.env.SHARED_DEMO_CUSTOMER_ORIGIN || CUSTOMER_ORIGIN,
  platformOrigin = process.env.SHARED_DEMO_PLATFORM_ORIGIN || PLATFORM_ORIGIN,
  expectedRuntimeRef = process.env.EXPECTED_RUNTIME_REF,
  expectedFrontendRef = process.env.EXPECTED_FRONTEND_REF,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('HOSTED_DEMO_DEPLOYMENT_FETCH_REQUIRED');
  requireOrigins(customerOrigin, platformOrigin);
  const runtimeRef = requireCommitRef(expectedRuntimeRef, 'HOSTED_DEMO_EXPECTED_RUNTIME_REF_INVALID');
  const frontendRef = requireCommitRef(expectedFrontendRef, 'HOSTED_DEMO_EXPECTED_FRONTEND_REF_INVALID');

  const results = [];
  for (const service of SERVICES) {
    const metadata = await readMetadata(fetchImpl, service);
    assertMetadata(metadata, service, runtimeRef, frontendRef);
    results.push(Object.freeze({ ...metadata }));
  }
  return Object.freeze(results);
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  const [customer, platform] = await verifyHostedDemoDeployment();
  process.stdout.write(`verified_frontend_ref=${customer.frontendRef}\n`);
  process.stdout.write(`verified_runtime_ref=${customer.runtimeRef}\n`);
  process.stdout.write(`customer_service=${customer.serviceName}\n`);
  process.stdout.write(`platform_service=${platform.serviceName}\n`);
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildProtectedFrontendArtifacts, writeProtectedFrontendArtifacts } from '../scripts/protected-frontend-artifacts.mjs';
import { createApiClient } from '../src/core/api-client.js';

const CUSTOMER = 'https://app.int.pavurel.eu';
const PLATFORM = 'https://platform.int.pavurel.eu';
const LEGACY_CUSTOMER = 'https://conference-manager-demo.onrender.com';
const LEGACY_PLATFORM = 'https://conference-manager-ops-demo.onrender.com';
const selected = Object.freeze({
  root: fileURLToPath(new URL('../', import.meta.url)),
  apiCommit: 'a'.repeat(40),
  frontendCommit: 'b'.repeat(40),
  customerOrigin: CUSTOMER,
  platformOrigin: PLATFORM,
  environment: 'int',
  syntheticEnabled: true,
  microsoftEnabled: true,
  invitationsEnabled: true,
  ownerAccessEnabled: true,
});

test('Pavurel INT artifacts seal both approved origins while retaining separate same-origin browser surfaces', async t => {
  const built = await buildProtectedFrontendArtifacts(selected);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cm-pavurel-int-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const destination = path.join(directory, 'artifacts');
  await writeProtectedFrontendArtifacts(built, destination);

  for (const [surface, documentPath, counterpart] of [
    ['customer', 'index.html', PLATFORM],
    ['platform', 'platform-admin/index.html', CUSTOMER],
  ]) {
    const raw = await readFile(path.join(destination, surface, 'manifest.json'));
    const manifest = JSON.parse(raw);
    assert.equal(manifest.surface, surface);
    assert.equal(manifest.environment, 'int');
    assert.equal(manifest.customerOrigin, CUSTOMER);
    assert.equal(manifest.platformOrigin, PLATFORM);
    assert.equal(manifest.apiCommit, selected.apiCommit);
    assert.equal(manifest.frontendCommit, selected.frontendCommit);
    for (const flag of ['syntheticEnabled', 'microsoftEnabled', 'invitationsEnabled', 'ownerAccessEnabled']) {
      assert.equal(manifest[flag], true);
    }
    assert.equal(createHash('sha256').update(raw).digest('hex'), built.manifestDigests[surface]);

    const html = await readFile(path.join(destination, surface, documentPath), 'utf8');
    assert.equal(html.match(/form-action ([^;]+);/)?.[1], `'self' ${counterpart}`);
    assert.equal(html.match(/connect-src ([^;]+);/)?.[1], "'self'");
    assert.match(html, /name="referrer" content="same-origin"/);
    assert.match(html, /conference-deployment-environment" content="int"/);
    assert.match(html, /conference-runtime" content="production"/);
    assert.doesNotMatch(html, /conference-demo-data|demo-bootstrap\.js/);

    for (const entry of manifest.files) {
      const bytes = await readFile(path.join(destination, surface, entry.path));
      assert.equal(bytes.length, entry.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
      assert.doesNotMatch(entry.path, /^(?:tests|scripts|deployment)\//);
      if (surface === 'customer') assert.doesNotMatch(entry.path, /^src\/platform-admin\//);
      else assert.doesNotMatch(entry.path, /^src\/(?:employee|manager|tenant-admin)\//);
      if (/\.(?:html|js|css|json|svg)$/.test(entry.path)) {
        const source = bytes.toString('utf8');
        assert.equal(source.includes(LEGACY_CUSTOMER), false, entry.path);
        assert.equal(source.includes(LEGACY_PLATFORM), false, entry.path);
      }
    }
  }
});

test('changing the selected INT origins requires new sealed artifacts rather than reusing Render-domain pins', async () => {
  const current = await buildProtectedFrontendArtifacts(selected);
  const previous = await buildProtectedFrontendArtifacts({
    ...selected, customerOrigin: LEGACY_CUSTOMER, platformOrigin: LEGACY_PLATFORM,
  });
  for (const surface of ['customer', 'platform']) {
    assert.deepEqual(current.sets[surface], previous.sets[surface]);
    assert.notEqual(current.digests[surface], previous.digests[surface]);
    assert.notEqual(current.manifestDigests[surface], previous.manifestDigests[surface]);
    for (const name of current.sets[surface]) {
      if (name !== 'index.html' && name !== 'platform-admin/index.html') {
        assert.deepEqual(current.content.get(`${surface}:${name}`), previous.content.get(`${surface}:${name}`));
      }
    }
  }
});

test('Pavurel INT builds reject missing, aliased and noncanonical origins before emitting artifacts', async () => {
  for (const change of [
    { customerOrigin: undefined },
    { platformOrigin: undefined },
    { platformOrigin: CUSTOMER },
    { customerOrigin: PLATFORM },
    { customerOrigin: 'http://app.int.pavurel.eu' },
    { platformOrigin: `${PLATFORM}/` },
    { platformOrigin: `${PLATFORM}/api/v1/platform` },
    { platformOrigin: `${PLATFORM}?next=foreign` },
    { platformOrigin: `${PLATFORM}#fragment` },
    { platformOrigin: 'https://user@platform.int.pavurel.eu' },
    { platformOrigin: `${PLATFORM};form-action *` },
  ]) {
    await assert.rejects(buildProtectedFrontendArtifacts({ ...selected, ...change }), /PROTECTED_/);
  }
  await assert.rejects(buildProtectedFrontendArtifacts({ ...selected, environment: 'prod' }), /PROTECTED_/);
});

test('the two Pavurel subdomains retain distinct API credentials and reject sibling-origin requests', async () => {
  for (const [origin, counterpart, baseUrl] of [
    [CUSTOMER, PLATFORM, '/api/v1/'],
    [PLATFORM, CUSTOMER, '/api/v1/platform/'],
  ]) {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
    };
    const client = createApiClient({ origin, baseUrl, fetchImpl,
      csrfTokenProvider: () => 'domain-test-csrf-value' });
    await client.request('session');
    await client.request('session', { method: 'DELETE' });
    assert.equal(calls.length, 2);
    for (const { url, options } of calls) {
      assert.equal(url, `${origin}${baseUrl}session`);
      assert.equal(options.credentials, 'same-origin');
      assert.equal(options.redirect, 'error');
      assert.equal(options.cache, 'no-store');
    }
    assert.equal(calls[1].options.headers['X-CSRF-Token'], 'domain-test-csrf-value');
    assert.throws(() => createApiClient({ origin, baseUrl: `${counterpart}${baseUrl}`, fetchImpl }), /INVALID_API_BASE/);
    await assert.rejects(client.request(`${counterpart}${baseUrl}session`), /INVALID_API_PATH/);
    await assert.rejects(client.request(`//${new URL(counterpart).host}${baseUrl}session`), /INVALID_API_PATH/);
    assert.equal(calls.length, 2);
    const withoutCsrf = createApiClient({ origin, baseUrl, fetchImpl });
    await assert.rejects(withoutCsrf.request('session', { method: 'DELETE' }), /CSRF_TOKEN_REQUIRED/);
    assert.equal(calls.length, 2);
  }
});

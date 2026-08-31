import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const PROXY_PATH = 'scripts/serve-hosted-demo-e2e.mjs';

test('hosted Demo proxy stays fixed-origin and outlives the bounded reset request', () => {
  const source = readFileSync(PROXY_PATH, 'utf8');
  const timeout = source.match(/const UPSTREAM_TIMEOUT_MS = ([\d_]+);/);
  assert.ok(timeout, 'Hosted proxy must declare one explicit upstream timeout');
  const timeoutMs = Number(timeout[1].replaceAll('_', ''));
  assert.ok(timeoutMs > 60_000, 'Hosted proxy must not mask the bounded 60-second reset budget');
  assert.ok(timeoutMs <= 90_000, 'Hosted proxy timeout must remain bounded');
  assert.match(source, /upstream\.setTimeout\(UPSTREAM_TIMEOUT_MS,/);

  assert.match(source, /new URL\('https:\/\/conference-manager-demo\.onrender\.com'\)/);
  assert.match(source, /new URL\('https:\/\/conference-manager-ops-demo\.onrender\.com'\)/);
  assert.match(source, /if \(value !== expected\.origin\) throw new TypeError/);
  assert.doesNotMatch(source, /process\.env\.(?:TARGET|UPSTREAM|DESTINATION|URL)/);
});

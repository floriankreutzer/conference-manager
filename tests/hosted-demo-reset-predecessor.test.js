import assert from 'node:assert/strict';
import test from 'node:test';
import { CANONICAL_DEMO_CHECKSUM, resetHostedDemoBaseline } from '../scripts/reset-hosted-demo-baseline.mjs';

const ORIGIN = 'https://conference-manager-ops-demo.onrender.com';
const PREDECESSOR = '5294793a72e5569afe03d0855b3fcfdf3ec89832';
const CURRENT = 'aab347c774042fe0c54b846fac018008e88d098c';
const PROMOTED = 'bf9aeb03f3395a6efa64298d01b4e3637282fb0e';
const SECURITY_FIXED = 'dccd86b3dc1eb208423407f104686aff347581ef';
const COST_OPTIMIZED = 'c9f1e45565c268768c1b814b610bf5cab6b8650a';
const COLD_STATIC_FIXED = '356459004dbede11cc3cd17a93d4e6cf515d410b';
const SEED = 'saas-3.7-three-demo-customers-v1';

function cleanupFixture({ seed = SEED, checksums = [CANONICAL_DEMO_CHECKSUM, CANONICAL_DEMO_CHECKSUM] } = {}) {
  const calls = [];
  let resetCount = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.equal(new URL(url).origin, ORIGIN);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    const headers = { 'Content-Type': 'application/json', 'Set-Cookie': `cm_platform_session=${'a'.repeat(32)}; HttpOnly; Secure` };
    if (url.endsWith('/session')) {
      assert.equal(options.method, undefined);
      return new Response(JSON.stringify({ csrfToken: 'b'.repeat(32) }), { headers });
    }
    assert.equal(options.headers.Origin, ORIGIN);
    assert.equal(options.headers['X-CSRF-Token'], 'b'.repeat(32));
    assert.equal(options.headers.Cookie, `cm_platform_session=${'a'.repeat(32)}`);
    if (url.endsWith('/session/persona')) {
      assert.equal(options.method, 'PUT');
      assert.deepEqual(JSON.parse(options.body), { persona: 'security_admin' });
      return new Response(JSON.stringify({ csrfToken: 'b'.repeat(32) }), { headers });
    }
    assert.equal(url, `${ORIGIN}/api/v1/platform/demo/reset`);
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { confirm: true });
    return new Response(JSON.stringify({ seedVersion: seed, checksum: checksums[resetCount++] }), { headers });
  };
  return { calls, fetchImpl };
}

for (const expectedRuntimeRef of [PREDECESSOR, CURRENT, PROMOTED, SECURITY_FIXED, COST_OPTIMIZED, COLD_STATIC_FIXED]) {
  test(`reset retains the exact canonical binding for ${expectedRuntimeRef}`, async () => {
    const fixture = cleanupFixture();
    const result = await resetHostedDemoBaseline({ ...fixture, origin: ORIGIN, expectedRuntimeRef });
    assert.deepEqual(result, { seedVersion: SEED, checksum: CANONICAL_DEMO_CHECKSUM });
    assert.ok(Object.isFrozen(result));
    assert.equal(fixture.calls.length, 6, 'Both independent reset cycles are required');
  });
}

for (const [name, options, expectedError, calls] of [
  ['wrong seed', { seed: 'saas-3.6-shared-demo-v5' }, /HOSTED_DEMO_RESET_RESULT_INVALID/, 3],
  ['wrong canonical checksum', { checksums: ['f'.repeat(64), 'f'.repeat(64)] }, /HOSTED_DEMO_RESET_CANONICAL_CHECKSUM_INVALID/, 6],
  ['nonrepeatable checksum', { checksums: [CANONICAL_DEMO_CHECKSUM, 'f'.repeat(64)] }, /HOSTED_DEMO_RESET_REPEATABILITY_INVALID/, 6],
]) {
  test(`historical predecessor still rejects ${name}`, async () => {
    const fixture = cleanupFixture(options);
    await assert.rejects(resetHostedDemoBaseline({ ...fixture, origin: ORIGIN, expectedRuntimeRef: PREDECESSOR }), expectedError);
    assert.equal(fixture.calls.length, calls);
  });
}

test('predecessor retention never accepts arbitrary refs or alternate origins', async () => {
  const fetchImpl = async () => assert.fail('Invalid binding must fail before network access');
  await assert.rejects(resetHostedDemoBaseline({ fetchImpl, origin: ORIGIN, expectedRuntimeRef: 'f'.repeat(40) }),
    /HOSTED_DEMO_RESET_RUNTIME_REF_UNSUPPORTED/);
  await assert.rejects(resetHostedDemoBaseline({ fetchImpl, origin: 'https://example.invalid', expectedRuntimeRef: PREDECESSOR }),
    /HOSTED_DEMO_RESET_ORIGIN_INVALID/);
});

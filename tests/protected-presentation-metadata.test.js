import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { featureFlags } from '../src/platform/feature-flags.js';
import { createProtectedCustomerHtml } from '../scripts/protected-customer-html.mjs';
import { createProtectedPlatformHtml } from '../scripts/protected-platform-html.mjs';
function documentFixture(values={}) {
  return { querySelectorAll(selector) {
    const name=selector.slice('meta[name="'.length,-2),value=values[name];
    return value===undefined ? [] : (Array.isArray(value) ? value : [value]).map(content=>({ content }));
  } };
}
const enabled={ 'conference-protected-runtime': 'true','conference-deployment-environment': 'int',
  'conference-protected-synthetic': 'enabled','conference-protected-microsoft': 'enabled','conference-protected-invitations': 'enabled' };

test('only exact protected document metadata enables registered presentation; missing/duplicate profiles and PROD synthetic fail closed',()=>{
  for (const doc of [undefined,documentFixture(),documentFixture({ ...enabled,'conference-protected-runtime': ['true','true'] }),
    documentFixture({ ...enabled,'conference-deployment-environment': 'unknown' })]) {
    const flags=featureFlags.forProtectedDocument(doc);
    for (const name of ['platform.synthetic-workspace','customer.synthetic-handoff','customer.invitations','customer.microsoft-authentication']) {
      assert.equal(flags.isEnabled(name),false);
    }
  }
  const flags=featureFlags.forProtectedDocument(documentFixture(enabled));
  for (const name of ['platform.synthetic-workspace','customer.synthetic-handoff','platform.customer-invitations',
    'customer.invitations','customer.microsoft-authentication']) assert.equal(flags.isEnabled(name),true);
  assert.equal(flags.isEnabled('unknown.grant'),false);
  const prod=featureFlags.forProtectedDocument(documentFixture({ ...enabled,'conference-deployment-environment': 'prod' }));
  assert.equal(prod.isEnabled('platform.synthetic-workspace'),false);assert.equal(prod.isEnabled('customer.synthetic-handoff'),false);
  assert.equal(prod.isEnabled('customer.invitations'),true);assert.equal(prod.isEnabled('customer.microsoft-authentication'),true);
});

test('both protected immutable artifacts share fixed origins, closed flag configuration, private document policy and exact form counterpart',async()=>{
  const customer=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const platform=await readFile(new URL('../platform-admin/index.html',import.meta.url),'utf8');
  const configuration={ customerOrigin: 'https://127.0.0.1:4173',platformOrigin: 'https://127.0.0.1:4174',
    environment: 'int',syntheticEnabled: true,microsoftEnabled: true,invitationsEnabled: true };
  for (const [build,source,counterpart] of [[createProtectedCustomerHtml,customer,configuration.platformOrigin],
    [createProtectedPlatformHtml,platform,configuration.customerOrigin]]) {
    const html=build({ source,...configuration });
    assert.ok(html.includes('name="referrer" content="same-origin"'));
    assert.ok(html.includes(`form-action 'self' ${counterpart};`));
    assert.ok(html.includes('name="conference-protected-synthetic" content="enabled"'));
    assert.ok(html.includes('name="conference-protected-invitations" content="enabled"'));
    assert.throws(()=>build({ source,...configuration,environment: 'prod' }),/PRESENTATION_CONFIGURATION_INVALID/);
    assert.throws(()=>build({ source,...configuration,syntheticEnabled: 'true' }),/PRESENTATION_CONFIGURATION_INVALID/);
    assert.throws(()=>build({ source,...configuration,platformOrigin: 'https://foreign.invalid/path' }));
  }
  assert.ok(customer.includes('content="demo"'));assert.ok(platform.includes('name="referrer" content="no-referrer"'));
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createProtectedCustomerHtml } from '../scripts/protected-customer-html.mjs';
const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
const options={ source,customerOrigin: 'https://127.0.0.1:4173',platformOrigin: 'https://127.0.0.1:4174' };
test('protected Customer artifact retains canonical shell while fixing private same-origin referrer and exact form counterpart',()=>{
  const html=createProtectedCustomerHtml(options);
  assert.ok(html.includes('name="referrer" content="same-origin"'));
  assert.ok(html.includes("form-action 'self' https://127.0.0.1:4174;"));
  assert.ok(html.includes('name="conference-runtime" content="production"'));
  assert.ok(html.includes('./src/platform/production-bootstrap.js'));
  assert.equal(html.includes('name="conference-demo-data"'),false);assert.equal(html.includes('demo-bootstrap.js'),false);
  assert.ok(source.includes('name="referrer" content="no-referrer"'));assert.ok(source.includes("form-action 'self';"));
  for (const patch of [{ platformOrigin: options.customerOrigin },{ platformOrigin: 'https://foreign.invalid/path' },
    { platformOrigin: 'http://foreign.invalid' },{ platformOrigin: 'https://foreign.invalid;form-action' },
    { source: source.replace('form-action', 'removed-form-action') }]) {
    assert.throws(()=>createProtectedCustomerHtml({ ...options,...patch }));
  }
});

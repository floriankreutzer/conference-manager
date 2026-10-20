import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthenticationFormNavigation } from '../src/shared/authentication-form-navigation.js';
function fixture() {
  const children=[],listeners=new Map(),submitted=[];
  const documentRef={ body: { append(node) { children.push(node); } },createElement(tag) {
    return { tag,children: [],append(node) { this.children.push(node); },remove() {
      const index=children.indexOf(this);if (index>=0) children.splice(index,1);
    } };
  } };
  const windowRef={ HTMLFormElement: { prototype: { submit() { submitted.push(this); } } },
    addEventListener: (key,listener)=>listeners.set(key,listener),removeEventListener: key=>listeners.delete(key) };
  return { documentRef,windowRef,children,listeners,submitted,
    forms: createAuthenticationFormNavigation({ origin: 'https://127.0.0.1',documentRef,windowRef }) };
}
test('native authentication navigation retains the document form through submission and removes sensitive controls on pagehide',()=>{
  const f=fixture();f.forms.submit('customer-complete',{ csrfToken: 'c'.repeat(64) });
  const form=f.submitted[0];assert.equal(form.action,'https://127.0.0.1/api/v1/auth/delegation/complete');
  assert.equal(form.method,'post');assert.equal(form.enctype,'application/x-www-form-urlencoded');assert.equal(form.target,'_self');
  assert.equal(form.hidden,true);assert.equal(form.children.length,1);assert.equal(form.children[0].name,'csrfToken');
  assert.equal(form.children[0].value,'c'.repeat(64));assert.equal(f.children.length,1);
  assert.throws(()=>f.forms.submit('customer-start'),/NAVIGATION_INVALID/);
  f.listeners.get('pagehide')();assert.equal(f.children.length,0);f.forms.submit('customer-start');
  assert.equal(f.children[0].children.length,0);f.forms.dispose();assert.equal(f.children.length,0);assert.equal(f.listeners.size,0);
  assert.throws(()=>f.forms.submit('customer-start'),/NAVIGATION_INVALID/);
});
test('only three fixed same-origin forms accept exact bounded proof fields; arbitrary actions and authority are rejected',()=>{
  const f=fixture();
  for (const [action,fields] of [['foreign',{}],['https://foreign.invalid',{}],['customer-start',{ tenantId: 'foreign' }],
    ['customer-complete',{ csrfToken: 'S'.repeat(43) }],['platform-approve',{ csrfToken: 'c'.repeat(64),payload: '{}' }],
    ['platform-approve',{ csrfToken: 'S'.repeat(43),payload: 'x'.repeat(16385) }],
    ['platform-approve',{ csrfToken: 'S'.repeat(43),payload: '☃'.repeat(4000) }]]) {
    assert.throws(()=>f.forms.submit(action,fields),/NAVIGATION_INVALID/);
  }
  assert.equal(f.children.length,0);assert.equal(f.submitted.length,0);
  f.forms.submit('platform-approve',{ csrfToken: 'S'.repeat(43),payload: '{"state":"candidate"}' });
  assert.equal(f.submitted[0].action,'https://127.0.0.1/api/v1/platform/auth/delegation/approve');
  assert.deepEqual(f.submitted[0].children.map(x=>x.name),['csrfToken','payload']);
  f.forms.reset();assert.equal(f.children.length,0);
});

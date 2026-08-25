import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/tenant-admin/application.js', 'utf8');

test('Microsoft 365 lifecycle status remains screen-reader observable after loading', () => {
  assert.match(
    source,
    /className: 'status-chip',[\s\S]*?attrs: \{ role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' \}/,
  );
});

test('Microsoft 365 lifecycle mutations share one in-flight guard across sibling actions', () => {
  assert.match(source, /let mutationPending = false;/);
  assert.match(source, /actions\.querySelectorAll\('button'\)\.forEach/);
  assert.match(source, /if \(mutationPending\) return;/);
  assert.match(source, /setLifecyclePending\(true\);/);
  assert.match(source, /setLifecyclePending\(false\);/);
});

test('Microsoft 365 lifecycle failures are both visible and announced', () => {
  assert.match(
    source,
    /const message = el\('p',[\s\S]*?attrs: \{ role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' \}/,
  );
  assert.match(source, /message\.textContent = errorText;/);
  assert.match(source, /announce\(errorText, \{ assertive: true \}\);/);
  assert.match(source, /surface\.append\(actions, message\);/);
});

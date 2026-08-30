import test from 'node:test';
import assert from 'node:assert/strict';

import { PLATFORM_ADMIN_MESSAGES } from '../src/core/i18n-platform-admin-messages.js';

function placeholders(value) {
  return [...new Set([...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
}

test('Platform Admin messages have synchronized German and English keys and placeholders', () => {
  const deKeys = Object.keys(PLATFORM_ADMIN_MESSAGES.de).sort();
  const enKeys = Object.keys(PLATFORM_ADMIN_MESSAGES.en).sort();
  assert.deepEqual(deKeys, enKeys);
  for (const key of deKeys) {
    assert.deepEqual(placeholders(PLATFORM_ADMIN_MESSAGES.de[key]), placeholders(PLATFORM_ADMIN_MESSAGES.en[key]), key);
  }
});

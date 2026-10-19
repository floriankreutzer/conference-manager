import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceStyleViolations } from '../scripts/check-style.mjs';

test('source formatting rejects missing newline, trailing spaces and tabs with line diagnostics', () => {
  assert.deepEqual(sourceStyleViolations('export const ready = true;\n'), []);
  assert.deepEqual(sourceStyleViolations('export const ready = true;\r\n'), []);
  assert.deepEqual(sourceStyleViolations('export const ready = true;'), ['missing final newline']);
  assert.deepEqual(sourceStyleViolations('const ready = true; \n\tready;\n'), [
    'line 1: trailing whitespace', 'line 2: tab',
  ]);
  assert.deepEqual(sourceStyleViolations('const ready = true; \r\n\tready;\r\n'), [
    'line 1: trailing whitespace', 'line 2: tab',
  ]);
});

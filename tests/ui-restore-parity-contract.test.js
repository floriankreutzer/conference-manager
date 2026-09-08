import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CONTRACT = new URL('../docs/UI-RESTORE-PARITY.md', import.meta.url);
const ARCHITECTURE = new URL('../docs/ARCHITECTURE.md', import.meta.url);

async function source(url) {
  return readFile(url, 'utf8');
}

test('SaaS 3.6 UI restore contract inventories every approved capability surface', async () => {
  const contract = await source(CONTRACT);

  assert.match(contract, /07f2896d56e6f66a9f8daf96457ab12c763adf80/);
  assert.match(contract, /server-issued Principal/);
  assert.match(contract, /never reconnect historical LocalStorage business authority/);

  for (let index = 1; index <= 15; index += 1) {
    assert.match(contract, new RegExp(`EMP-${String(index).padStart(2, '0')}`));
  }
  for (let index = 1; index <= 14; index += 1) {
    assert.match(contract, new RegExp(`MGR-${String(index).padStart(2, '0')}`));
  }
  for (let index = 1; index <= 5; index += 1) {
    assert.match(contract, new RegExp(`REG-${String(index).padStart(2, '0')}`));
  }

  assert.equal((contract.match(/^\| `EMP-\d{2}` \|/gm) || []).length, 15);
  assert.equal((contract.match(/^\| `MGR-\d{2}` \|/gm) || []).length, 14);
  assert.equal((contract.match(/^\| `REG-\d{2}` \|/gm) || []).length, 5);

  for (const disposition of [
    'RESTORE_REQUIRED',
    'RETAIN_AND_ENHANCE',
    'RETAIN_CURRENT',
    'SUPERSEDED_BY_SECURITY',
    'REGRESSION_ONLY',
  ]) assert.match(contract, new RegExp(`\\b${disposition}\\b`));

  for (const issue of ['#179', '#180', '#181', '#182', '#169', '#170']) {
    assert.match(contract, new RegExp(issue));
  }
});

test('architecture documents the temporary active-renderer gap without making history authoritative', async () => {
  const architecture = await source(ARCHITECTURE);

  assert.match(architecture, /docs\/UI-RESTORE-PARITY\.md/);
  assert.match(architecture, /historical browser-state authority/);
  assert.match(architecture, /historical browser persistence/);
  assert.match(architecture, /not in the\s+active runtime graph/);
});

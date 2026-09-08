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

  const expectedDispositions = {
    EMP: [
      'RESTORE_REQUIRED', 'RETAIN_AND_ENHANCE', 'RESTORE_REQUIRED', 'RETAIN_AND_ENHANCE',
      'RETAIN_AND_ENHANCE', 'RETAIN_AND_ENHANCE', 'RESTORE_REQUIRED', 'RETAIN_AND_ENHANCE',
      'RETAIN_AND_ENHANCE', 'RETAIN_AND_ENHANCE', 'RESTORE_REQUIRED', 'RETAIN_AND_ENHANCE',
      'RETAIN_CURRENT', 'RETAIN_AND_ENHANCE', 'RETAIN_AND_ENHANCE',
    ],
    MGR: [
      'RESTORE_REQUIRED', 'RESTORE_REQUIRED', 'RESTORE_REQUIRED', 'RETAIN_AND_ENHANCE',
      'RETAIN_CURRENT', 'RETAIN_CURRENT', 'RETAIN_CURRENT', 'RETAIN_AND_ENHANCE',
      'RETAIN_AND_ENHANCE', 'RESTORE_REQUIRED', 'RETAIN_AND_ENHANCE', 'RETAIN_AND_ENHANCE',
      'SUPERSEDED_BY_SECURITY', 'SUPERSEDED_BY_SECURITY',
    ],
    REG: Array(5).fill('REGRESSION_ONLY'),
  };

  for (const [prefix, dispositions] of Object.entries(expectedDispositions)) {
    const rows = contract.split('\n').filter((line) => line.startsWith(`| \`${prefix}-`));
    assert.equal(rows.length, dispositions.length, `${prefix} matrix row count`);
    rows.forEach((row, index) => {
      const id = `${prefix}-${String(index + 1).padStart(2, '0')}`;
      const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
      const dispositionIndex = prefix === 'REG' ? 3 : 4;
      const evidenceIndex = prefix === 'REG' ? 4 : 5;
      assert.equal(cells.length, prefix === 'REG' ? 5 : 6, `${id} column count`);
      assert.equal(cells[0], `\`${id}\``);
      assert.equal(cells.every(Boolean), true, `${id} contains no empty contract cell`);
      assert.match(cells[dispositionIndex], new RegExp(`\\b${dispositions[index]}\\b`));
      assert.notEqual(cells[evidenceIndex], '', `${id} requires evidence`);
    });
  }

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

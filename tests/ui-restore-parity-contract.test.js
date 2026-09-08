import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CONTRACT = new URL('../docs/UI-RESTORE-PARITY.md', import.meta.url);
const ARCHITECTURE = new URL('../docs/ARCHITECTURE.md', import.meta.url);

async function source(url) {
  return readFile(url, 'utf8');
}

function tableCells(row) {
  return row.split('|').slice(1, -1).map((cell) => cell.trim());
}

function section(sourceText, heading) {
  const marker = `${heading}\n`;
  const start = sourceText.indexOf(marker);
  assert.notEqual(start, -1, `${heading} exists`);
  const bodyStart = start + marker.length;
  const nextHeading = sourceText.indexOf('\n## ', bodyStart);
  return sourceText.slice(bodyStart, nextHeading === -1 ? undefined : nextHeading);
}

test('SaaS 3.6 UI restore contract inventories every approved capability surface', async () => {
  const contract = await source(CONTRACT);

  assert.match(contract, /07f2896d56e6f66a9f8daf96457ab12c763adf80/);
  assert.match(contract, /b7c86e78add729dd8172a23af49fb1329e136b7c/);
  assert.match(contract, /server-issued Principal/);
  assert.match(contract, /never reconnect historical LocalStorage business authority/);

  const expectedDispositions = {
    EMP: [
      'RESTORE_REQUIRED', 'RETAIN_AND_ENHANCE', 'RESTORE_REQUIRED', 'RETAIN_AND_ENHANCE',
      'RETAIN_AND_ENHANCE', 'RETAIN_AND_ENHANCE', 'RESTORE_REQUIRED', 'RETAIN_AND_ENHANCE',
      'RETAIN_AND_ENHANCE', 'RETAIN_AND_ENHANCE', 'RESTORE_REQUIRED', 'RETAIN_AND_ENHANCE',
      'RETAIN_AND_ENHANCE', 'RETAIN_AND_ENHANCE', 'RETAIN_AND_ENHANCE',
    ],
    MGR: [
      'RESTORE_REQUIRED', 'RESTORE_REQUIRED', 'RESTORE_REQUIRED', 'RETAIN_AND_ENHANCE',
      'RETAIN_AND_ENHANCE', 'RETAIN_AND_ENHANCE', 'RETAIN_CURRENT', 'RETAIN_AND_ENHANCE',
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
      const cells = tableCells(row);
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

  for (const issue of ['#179', '#180', '#181', '#182', '#185', '#186', '#187', '#169', '#170']) {
    assert.match(contract, new RegExp(issue));
  }
});

test('restore contract records each missing server-owned projection without browser fallback', async () => {
  const contract = await source(CONTRACT);
  const apiContracts = section(contract, '## Required enabling server contracts');

  for (const identifier of ['API-01', 'API-02', 'API-03']) {
    assert.match(apiContracts, new RegExp('### `' + identifier + '`'));
  }

  for (const [identifier, issue] of [['API-01', '#186'], ['API-02', '#185'], ['API-03', '#187']]) {
    assert.match(apiContracts, new RegExp('`' + identifier + '`[\\s\\S]*?' + issue));
  }

  assert.match(apiContracts, /Room facilities and bookable Equipment are different concepts/);
  assert.match(apiContracts, /`equipment` collection/);
  assert.match(apiContracts, /Request schema v3/);
  assert.match(apiContracts, /schema v2 remains readable without Equipment/);
  assert.match(apiContracts, /`equipmentIds`/);
  assert.match(apiContracts, /`pricing\.equipment`/);
  assert.match(apiContracts, /`breakdown\.equipmentMinor`/);
  assert.match(apiContracts, /currentRoomContext\.guestPresentation/);
  assert.match(apiContracts, /Tenant Admin owns these Site-level fields/);
  assert.match(apiContracts, /exclude passwords, access codes,\s+Wi-Fi credentials, tokens/);
  assert.match(apiContracts, /requesterAttribution: \{ displayName \}/);
  assert.match(apiContracts, /actorAttribution: \{ displayName, roleAtAction \}/);
  assert.match(apiContracts, /`initiatorAttribution` and `deciderAttribution`/);
  assert.match(apiContracts, /request\s+bodies cannot nominate or overwrite it/);
  assert.match(apiContracts, /never be substituted/);

  for (const [surface, apiContract] of [
    ['EMP-04', 'API-01'],
    ['EMP-14', 'API-02'],
    ['EMP-15', 'API-02'],
    ['MGR-04', 'API-03'],
    ['MGR-06', 'API-03'],
    ['MGR-08', 'API-03'],
  ]) {
    const row = contract.split('\n').find((line) => line.startsWith(`| \`${surface}\``));
    assert.ok(row, `${surface} matrix row exists`);
    assert.match(row, new RegExp(`\\b${apiContract}\\b`));
  }
});

test('every parity surface has an exact navigation and validation trace', async () => {
  const contract = await source(CONTRACT);
  const traceability = section(contract, '### Traceability matrix');
  const rows = traceability.split('\n')
    .filter((line) => /^\| (?:EMP|MGR|REG)-\d{2} \|/.test(line))
    .map(tableCells);
  const expected = [
    ['EMP-01', 'Employee → New Request → six-step flow', 'STATE-FORM', 'RESP-WIZARD', 'A11Y-FORM', 'I18N-DATETIME', 'TEST-EMP-CREATE'],
    ['EMP-02', 'Employee → New Request → Schedule and Participants', 'STATE-FORM', 'RESP-WIZARD', 'A11Y-FORM', 'I18N-DATETIME', 'TEST-EMP-CREATE'],
    ['EMP-03', 'Employee → New Request → Room', 'STATE-FORM', 'RESP-CARDS', 'A11Y-CARDS', 'I18N-MONEY', 'TEST-EMP-CREATE'],
    ['EMP-04', 'Employee → New Request → Services and Equipment', 'STATE-FORM', 'RESP-CARDS', 'A11Y-CARDS', 'I18N-MONEY', 'TEST-EMP-CREATE'],
    ['EMP-05', 'Employee → New Request → Catering', 'STATE-FORM', 'RESP-CARDS', 'A11Y-CARDS', 'I18N-MONEY', 'TEST-EMP-CREATE'],
    ['EMP-06', 'Employee → New Request → Cost allocation', 'STATE-FORM', 'RESP-WIZARD', 'A11Y-FORM', 'I18N-MONEY', 'TEST-EMP-CREATE'],
    ['EMP-07', 'Employee → New Request → Review', 'STATE-FORM', 'RESP-CARDS', 'A11Y-NAV', 'I18N-MONEY', 'TEST-EMP-CREATE'],
    ['EMP-08', 'Employee → New Request → Review → Completion', 'STATE-ACTION', 'RESP-CARDS', 'A11Y-FORM', 'I18N-MONEY', 'TEST-EMP-CREATE'],
    ['EMP-09', 'Employee → Continue draft → restored wizard step', 'STATE-ACTION', 'RESP-WIZARD', 'A11Y-FORM', 'I18N-DATETIME', 'TEST-EMP-CREATE'],
    ['EMP-10', 'Employee → My Requests → Request detail', 'STATE-READ', 'RESP-CARDS', 'A11Y-DATA', 'I18N-MONEY', 'TEST-EMP-SELF'],
    ['EMP-11', 'Employee → Calendar → month and event detail', 'STATE-READ', 'RESP-DATA', 'A11Y-DATA', 'I18N-DATETIME', 'TEST-EMP-SELF'],
    ['EMP-12', 'Employee → My Requests → Request detail → History', 'STATE-READ', 'RESP-DIALOG', 'A11Y-DIALOG', 'I18N-AUDIT', 'TEST-EMP-SELF'],
    ['EMP-13', 'Employee → My Requests → eligible Request actions', 'STATE-ACTION', 'RESP-DIALOG', 'A11Y-DIALOG', 'I18N-AUDIT', 'TEST-EMP-SELF'],
    ['EMP-14', 'Employee → confirmed Request → Guest Information', 'STATE-READ', 'RESP-DIALOG', 'A11Y-DIALOG', 'I18N-DATETIME', 'TEST-EMP-SELF'],
    ['EMP-15', 'Employee → confirmed Request → Print', 'STATE-PRINT', 'RESP-PRINT', 'A11Y-PRINT', 'I18N-DATETIME', 'TEST-EMP-SELF'],
    ['MGR-01', 'Conference Manager → four-tab workspace', 'STATE-SHELL', 'RESP-SHELL', 'A11Y-NAV', 'I18N-BASE', 'TEST-MGR-COCKPIT'],
    ['MGR-02', 'Conference Manager → Bookings → Overview', 'STATE-ANALYTIC', 'RESP-CARDS', 'A11Y-DATA', 'I18N-MONEY', 'TEST-MGR-COCKPIT'],
    ['MGR-03', 'Conference Manager → Bookings → Search and filters', 'STATE-ANALYTIC', 'RESP-DATA', 'A11Y-FORM', 'I18N-BASE', 'TEST-MGR-COCKPIT'],
    ['MGR-04', 'Conference Manager → Bookings → Request detail', 'STATE-READ', 'RESP-CARDS', 'A11Y-DATA', 'I18N-AUDIT', 'TEST-MGR-COCKPIT'],
    ['MGR-05', 'Conference Manager → Bookings → Review decision', 'STATE-ACTION', 'RESP-DIALOG', 'A11Y-DIALOG', 'I18N-AUDIT', 'TEST-MGR-WORKFLOW'],
    ['MGR-06', 'Conference Manager → Bookings → Confirmed change decision', 'STATE-ACTION', 'RESP-DIALOG', 'A11Y-DIALOG', 'I18N-AUDIT', 'TEST-MGR-WORKFLOW'],
    ['MGR-07', 'Conference Manager → Bookings → eligible Request actions', 'STATE-ACTION', 'RESP-DIALOG', 'A11Y-DIALOG', 'I18N-AUDIT', 'TEST-MGR-WORKFLOW'],
    ['MGR-08', 'Conference Manager → Bookings → Request timeline', 'STATE-READ', 'RESP-DIALOG', 'A11Y-DIALOG', 'I18N-AUDIT', 'TEST-MGR-WORKFLOW'],
    ['MGR-09', 'Conference Manager → Room planning', 'STATE-ANALYTIC', 'RESP-DATA', 'A11Y-DATA', 'I18N-DATETIME', 'TEST-MGR-ANALYTICS'],
    ['MGR-10', 'Conference Manager → Reports → period and results', 'STATE-ANALYTIC', 'RESP-DATA', 'A11Y-DATA', 'I18N-MONEY', 'TEST-MGR-ANALYTICS'],
    ['MGR-11', 'Conference Manager → Administration → Rooms', 'STATE-FORM', 'RESP-DATA', 'A11Y-FORM', 'I18N-ADMIN', 'TEST-MGR-ADMIN'],
    ['MGR-12', 'Conference Manager → Administration → Catalogue', 'STATE-FORM', 'RESP-DATA', 'A11Y-FORM', 'I18N-ADMIN', 'TEST-MGR-ADMIN'],
    ['MGR-13', 'Conference Manager → every Request surface → no delete', 'STATE-ABSENCE', 'RESP-SHELL', 'A11Y-ABSENCE', 'I18N-BASE', 'TEST-MGR-WORKFLOW'],
    ['MGR-14', 'Conference Manager → workspace and direct entries → no provider administration', 'STATE-ABSENCE', 'RESP-SHELL', 'A11Y-ABSENCE', 'I18N-BASE', 'TEST-ROLE-GATE'],
    ['REG-01', 'Tenant Admin → authorized navigation and direct sections', 'STATE-SHELL', 'RESP-SHELL', 'A11Y-NAV', 'I18N-ADMIN', 'TEST-ROLE-GATE'],
    ['REG-02', 'Tenant Admin → shell and direct Manager entries → denied', 'STATE-ABSENCE', 'RESP-SHELL', 'A11Y-ABSENCE', 'I18N-BASE', 'TEST-ROLE-GATE'],
    ['REG-03', 'Customer shell → dual-role capability navigation', 'STATE-SHELL', 'RESP-SHELL', 'A11Y-NAV', 'I18N-BASE', 'TEST-ROLE-GATE'],
    ['REG-04', 'Demo context switcher → Tenant/persona → Customer shell', 'STATE-SHELL', 'RESP-SHELL', 'A11Y-FORM', 'I18N-BASE', 'TEST-ROLE-GATE'],
    ['REG-05', 'Every restored surface → inactivity lock → re-resolved unlock', 'STATE-SHELL', 'RESP-SHELL', 'A11Y-ABSENCE', 'I18N-BASE', 'TEST-ROLE-GATE'],
  ];

  assert.deepEqual(rows.map((cells) => cells.map((cell) => cell.replaceAll('`', ''))), expected);

  const profiles = [...new Set(expected.flatMap((cells) => cells.slice(2)))];
  for (const profile of profiles) {
    assert.equal(
      contract.split('\n').filter((line) => line.startsWith(`| \`${profile}\` |`)).length,
      1,
      `${profile} has exactly one definition`,
    );
  }
  assert.match(contract, /Every automated test title\/tag and every manual evidence record[\s\S]*parity ID/);
  assert.match(contract, /Chromium and WebKit\/iPhone/);
  assert.match(contract, /200% zoom\/reflow/);
  assert.match(contract, /Central complete DE\/EN units/i);
  assert.match(contract, /first-invalid focus/);
});

test('architecture documents the temporary active-renderer gap without making history authoritative', async () => {
  const architecture = await source(ARCHITECTURE);

  assert.match(architecture, /docs\/UI-RESTORE-PARITY\.md/);
  assert.match(architecture, /historical browser-state authority/);
  assert.match(architecture, /historical browser persistence/);
  assert.match(architecture, /not in the\s+active runtime graph/);
});

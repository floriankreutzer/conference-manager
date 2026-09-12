import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  verifyZapEvidenceFiles,
  ZAP_EVIDENCE_FILES,
  ZAP_EVIDENCE_FILE_LIMITS,
  ZAP_EVIDENCE_TOTAL_LIMIT,
} from '../scripts/verify-zap-evidence-files.mjs';

function fixture() {
  const workspace = mkdtempSync(join(tmpdir(), 'zap-evidence-boundary-'));
  const evidence = join(workspace, 'zap-evidence');
  mkdirSync(evidence);
  for (const name of ZAP_EVIDENCE_FILES) writeFileSync(join(evidence, name), name);
  return { evidence, workspace };
}

test('ZAP evidence boundary accepts only the reviewed regular files', () => {
  const value = fixture();
  try {
    assert.deepEqual(verifyZapEvidenceFiles({ workspace: value.workspace }).files, ZAP_EVIDENCE_FILES);
  } finally {
    rmSync(value.workspace, { recursive: true, force: true });
  }
});

test('ZAP evidence boundary rejects a container-created file symlink', () => {
  const value = fixture();
  try {
    const report = join(value.evidence, 'report_html.html');
    rmSync(report);
    symlinkSync('/proc/self/environ', report);
    assert.throws(
      () => verifyZapEvidenceFiles({ workspace: value.workspace }),
      /report_html[.]html must be a non-symlink regular file/,
    );
  } finally {
    rmSync(value.workspace, { recursive: true, force: true });
  }
});

test('ZAP evidence boundary rejects directory links and unreviewed entries', () => {
  const linked = fixture();
  const extra = fixture();
  try {
    rmSync(linked.evidence, { recursive: true });
    symlinkSync(extra.evidence, linked.evidence);
    assert.throws(
      () => verifyZapEvidenceFiles({ workspace: linked.workspace }),
      /zap-evidence must be a non-symlink directory/,
    );

    writeFileSync(join(extra.evidence, 'unreviewed.txt'), 'unexpected');
    assert.throws(
      () => verifyZapEvidenceFiles({ workspace: extra.workspace }),
      /exactly the reviewed evidence files/,
    );
  } finally {
    rmSync(linked.workspace, { recursive: true, force: true });
    rmSync(extra.workspace, { recursive: true, force: true });
  }
});

test('ZAP evidence boundary rejects oversized individual and aggregate evidence', () => {
  const individual = fixture();
  const aggregate = fixture();
  try {
    truncateSync(
      join(individual.evidence, 'report_json.json'),
      ZAP_EVIDENCE_FILE_LIMITS['report_json.json'] + 1,
    );
    assert.throws(
      () => verifyZapEvidenceFiles({ workspace: individual.workspace }),
      /report_json[.]json exceeds its reviewed size limit/,
    );

    const reportSize = Math.floor(ZAP_EVIDENCE_TOTAL_LIMIT / 3);
    for (const name of ['report_html.html', 'report_json.json', 'report_md.md']) {
      assert.ok(reportSize <= ZAP_EVIDENCE_FILE_LIMITS[name]);
      truncateSync(join(aggregate.evidence, name), reportSize);
    }
    assert.throws(
      () => verifyZapEvidenceFiles({ workspace: aggregate.workspace }),
      /evidence set exceeds its reviewed aggregate size limit/,
    );
  } finally {
    rmSync(individual.workspace, { recursive: true, force: true });
    rmSync(aggregate.workspace, { recursive: true, force: true });
  }
});

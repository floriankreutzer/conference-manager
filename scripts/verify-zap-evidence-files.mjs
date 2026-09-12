import {
  lstatSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ZAP_EVIDENCE_FILES = Object.freeze([
  'addons.txt',
  'report_html.html',
  'report_json.json',
  'report_md.md',
  'run-zap-baseline.sh',
  'zap.yaml',
]);

function fail(message) {
  throw new Error(`ZAP evidence boundary violation: ${message}`);
}

export function verifyZapEvidenceFiles({ workspace = process.cwd() } = {}) {
  const canonicalWorkspace = realpathSync(workspace);
  const evidenceDirectory = resolve(canonicalWorkspace, 'zap-evidence');
  const directoryMetadata = lstatSync(evidenceDirectory);
  if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory()) {
    fail('zap-evidence must be a non-symlink directory.');
  }
  if (realpathSync(evidenceDirectory) !== evidenceDirectory) {
    fail('zap-evidence escaped the canonical workspace.');
  }

  const actualNames = readdirSync(evidenceDirectory).sort();
  if (
    actualNames.length !== ZAP_EVIDENCE_FILES.length
    || actualNames.some((name, index) => name !== ZAP_EVIDENCE_FILES[index])
  ) {
    fail('the directory must contain exactly the reviewed evidence files.');
  }

  for (const name of actualNames) {
    const expectedPath = resolve(evidenceDirectory, name);
    const metadata = lstatSync(expectedPath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      fail(`${name} must be a non-symlink regular file.`);
    }
    if (realpathSync(expectedPath) !== expectedPath) {
      fail(`${name} escaped the canonical evidence directory.`);
    }
  }

  return Object.freeze({ directory: evidenceDirectory, files: Object.freeze(actualNames) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyZapEvidenceFiles();
  console.log(`Verified ${ZAP_EVIDENCE_FILES.length} link-free regular ZAP evidence files.`);
}

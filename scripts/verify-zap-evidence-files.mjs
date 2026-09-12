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

const KIBIBYTE = 1024;
const MEBIBYTE = 1024 * KIBIBYTE;
export const ZAP_EVIDENCE_FILE_LIMITS = Object.freeze({
  'addons.txt': 128 * KIBIBYTE,
  'report_html.html': 8 * MEBIBYTE,
  'report_json.json': 8 * MEBIBYTE,
  'report_md.md': 8 * MEBIBYTE,
  'run-zap-baseline.sh': 128 * KIBIBYTE,
  'zap.yaml': 512 * KIBIBYTE,
});
export const ZAP_EVIDENCE_TOTAL_LIMIT = 20 * MEBIBYTE;

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

  let totalSize = 0;
  for (const name of actualNames) {
    const expectedPath = resolve(evidenceDirectory, name);
    const metadata = lstatSync(expectedPath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      fail(`${name} must be a non-symlink regular file.`);
    }
    if (!Number.isSafeInteger(metadata.size) || metadata.size > ZAP_EVIDENCE_FILE_LIMITS[name]) {
      fail(`${name} exceeds its reviewed size limit.`);
    }
    totalSize += metadata.size;
    if (!Number.isSafeInteger(totalSize) || totalSize > ZAP_EVIDENCE_TOTAL_LIMIT) {
      fail('the evidence set exceeds its reviewed aggregate size limit.');
    }
    if (realpathSync(expectedPath) !== expectedPath) {
      fail(`${name} escaped the canonical evidence directory.`);
    }
  }

  return Object.freeze({
    directory: evidenceDirectory,
    files: Object.freeze(actualNames),
    totalSize,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyZapEvidenceFiles();
  console.log(`Verified ${ZAP_EVIDENCE_FILES.length} link-free regular ZAP evidence files.`);
}

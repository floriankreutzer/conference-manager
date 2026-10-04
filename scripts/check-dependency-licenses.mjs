import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Only license IDs already present in the accepted application lock graph.
// A new ID, exception or later-version modifier requires a reviewed policy change.
const BASELINE_LICENSES = new Set(['mit', 'apache-2.0']);
const DENIED_LICENSE = /^(?:a?gpl)-3\.0(?:-only|-or-later)?\+?$/i;
const MAX_EXPRESSION_LENGTH = 1024;
const MAX_DEPTH = 32;
const MAX_LOCK_BYTES = 8 * 1024 * 1024;
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function requirePolicy(condition, code) {
  if (!condition) throw new Error(code);
}

/** Validate the conservative SPDX subset; inspect ALL operands, including OR. */
export function validateLicenseExpression(expression) {
  requirePolicy(typeof expression === 'string' && expression.trim().length > 0, 'LICENSE_METADATA_MISSING');
  requirePolicy(expression.length <= MAX_EXPRESSION_LENGTH, 'LICENSE_EXPRESSION_TOO_LONG');
  requirePolicy(/^[\x20-\x7e\t]+$/.test(expression), 'LICENSE_EXPRESSION_INVALID');
  const tokens = expression.match(/[A-Za-z0-9][A-Za-z0-9.-]*\+?|[()]|[^ \t]/g) ?? [];
  let expectOperand = true;
  let depth = 0;
  for (const token of tokens) {
    if (expectOperand) {
      if (token === '(') {
        depth += 1;
        requirePolicy(depth <= MAX_DEPTH, 'LICENSE_EXPRESSION_TOO_DEEP');
        continue;
      }
      requirePolicy(!DENIED_LICENSE.test(token), 'LICENSE_DENIED');
      requirePolicy(BASELINE_LICENSES.has(token.toLowerCase()), 'LICENSE_REVIEW_REQUIRED');
      expectOperand = false;
    } else if (token === ')') {
      requirePolicy(depth > 0, 'LICENSE_EXPRESSION_INVALID');
      depth -= 1;
    } else {
      requirePolicy(token !== 'WITH', 'LICENSE_EXCEPTION_REVIEW_REQUIRED');
      requirePolicy(token === 'AND' || token === 'OR', 'LICENSE_EXPRESSION_INVALID');
      expectOperand = true;
    }
  }
  requirePolicy(!expectOperand && depth === 0, 'LICENSE_EXPRESSION_INVALID');
}

/** Inspect every third-party lock entry, including development and optional packages. */
export function validateLockfileLicenses(lock) {
  requirePolicy(isRecord(lock) && lock.lockfileVersion === 3, 'LICENSE_LOCK_FORMAT_UNSUPPORTED');
  requirePolicy(isRecord(lock.packages) && Object.hasOwn(lock.packages, '')
    && isRecord(lock.packages['']), 'LICENSE_LOCK_GRAPH_MISSING');
  const entries = Object.entries(lock.packages).filter(([path]) => path !== '');
  requirePolicy(entries.length > 0, 'LICENSE_LOCK_GRAPH_EMPTY');
  for (const [path, metadata] of entries) {
    requirePolicy(path.startsWith('node_modules/') && !path.split('/').includes('..')
      && /^[\x20-\x7e]+$/.test(path), 'LICENSE_PACKAGE_PATH_INVALID');
    requirePolicy(isRecord(metadata), 'LICENSE_PACKAGE_METADATA_INVALID');
    requirePolicy(metadata.link === undefined || metadata.link === false, 'LICENSE_LINK_REVIEW_REQUIRED');
    // Do not fall back to the registry or installed package data when lock evidence is absent.
    validateLicenseExpression(metadata.license);
  }
  return entries.length;
}

function main() {
  try {
    requirePolicy(process.argv.length === 2, 'LICENSE_CLI_ARGUMENTS_UNSUPPORTED');
    const stats = statSync('package-lock.json');
    requirePolicy(stats.isFile() && stats.size <= MAX_LOCK_BYTES, 'LICENSE_LOCK_FILE_INVALID');
    const count = validateLockfileLicenses(JSON.parse(readFileSync('package-lock.json', 'utf8')));
    console.log(`Dependency license policy passed for all ${count} third-party lock entries.`);
  } catch (error) {
    // Metadata is untrusted. Print only bounded policy codes, never raw file content/errors.
    const code = /^LICENSE_[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'LICENSE_LOCK_UNREADABLE';
    console.error(`Dependency license policy blocked: ${code}`);
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

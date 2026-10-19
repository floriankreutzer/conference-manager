import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function sourceStyleViolations(source) {
  const violations = [];
  if (!source.endsWith('\n')) violations.push('missing final newline');
  source.split('\n').forEach((line, index) => {
    if (/\s+$/.test(line)) violations.push(`line ${index + 1}: trailing whitespace`);
    if (line.includes('\t')) violations.push(`line ${index + 1}: tab`);
  });
  return violations;
}

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(current));
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(current);
  }
  return files;
}

async function main() {
  const files = [];
  for (const root of ['src', 'scripts', 'tests']) files.push(...await filesUnder(root));
  const violations = [];
  for (const file of files) {
    for (const violation of sourceStyleViolations(await readFile(file, 'utf8'))) violations.push(`${file}: ${violation}`);
  }
  if (violations.length) throw new Error(violations.join('\n'));
  console.log(`Source whitespace formatting check passed for ${files.length} JavaScript files.`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();

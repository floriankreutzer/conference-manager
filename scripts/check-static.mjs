import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
function walk(path) {
  for (const entry of readdirSync(path)) {
    const full = join(path, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (full.endsWith('.js')) files.push(full);
  }
}
walk('src');
const forbidden = [
  { pattern: /\beval\s*\(/, message: 'eval is forbidden' },
  { pattern: /document\.write\s*\(/, message: 'document.write is forbidden' },
  { pattern: /\.innerHTML\s*=/, message: 'innerHTML assignment is forbidden in application code' },
  { pattern: /javascript:/i, message: 'javascript: URLs are forbidden' },
];
let failures = 0;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) {
      console.error(`${file}: ${rule.message}`);
      failures += 1;
    }
  }
}
if (failures) process.exit(1);
console.log(`Static defensive-code check passed for ${files.length} source files.`);

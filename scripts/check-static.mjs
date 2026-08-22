import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const sourceFiles = [];
function walk(path) {
  for (const entry of readdirSync(path)) {
    const full = join(path, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(?:js|html)$/.test(full)) sourceFiles.push(full);
  }
}
walk('src');
sourceFiles.push('index.html');

const forbidden = [
  { pattern: /\beval\s*\(/, message: 'eval is forbidden' },
  { pattern: /\bnew\s+Function\s*\(/, message: 'Function constructor is forbidden' },
  { pattern: /document\.write\s*\(/, message: 'document.write is forbidden' },
  { pattern: /\.innerHTML\s*=/, message: 'innerHTML assignment is forbidden in application code' },
  { pattern: /\.outerHTML\s*=/, message: 'outerHTML assignment is forbidden in application code' },
  { pattern: /insertAdjacentHTML\s*\(/, message: 'insertAdjacentHTML is forbidden in application code' },
  { pattern: /setAttribute\s*\(\s*['"]on[a-z]+['"]/i, message: 'inline event-handler attributes are forbidden' },
  { pattern: /setAttribute\s*\(\s*['"]style['"]/i, message: 'inline style attributes are forbidden' },
  { pattern: /javascript\s*:/i, message: 'javascript: URLs are forbidden' },
  { pattern: /vbscript\s*:/i, message: 'vbscript: URLs are forbidden' },
  { pattern: /data\s*:\s*text\/html/i, message: 'data:text/html URLs are forbidden' },
];

let failures = 0;
for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) {
      console.error(`${file}: ${rule.message}`);
      failures += 1;
    }
  }
}

const index = readFileSync('index.html', 'utf8');
const requiredCspDirectives = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "connect-src 'none'",
  "worker-src 'none'",
];
if (!/http-equiv=["']Content-Security-Policy["']/i.test(index)) {
  console.error('index.html: Content-Security-Policy meta is required for the static demo');
  failures += 1;
}
for (const directive of requiredCspDirectives) {
  if (!index.includes(directive)) {
    console.error(`index.html: CSP directive missing: ${directive}`);
    failures += 1;
  }
}
if (/style-src[^;]*'unsafe-inline'/i.test(index)) {
  console.error("index.html: style-src must not allow 'unsafe-inline'");
  failures += 1;
}
if (/script-src[^;]*'unsafe-(?:inline|eval)'/i.test(index)) {
  console.error('index.html: script-src must not allow unsafe-inline or unsafe-eval');
  failures += 1;
}
if (!/<meta\s+name=["']referrer["']\s+content=["']no-referrer["']/i.test(index)) {
  console.error('index.html: no-referrer policy is required');
  failures += 1;
}

if (failures) process.exit(1);
console.log(`Static defensive-code check passed for ${sourceFiles.length} source files.`);

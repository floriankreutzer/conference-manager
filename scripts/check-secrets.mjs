import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git', 'node_modules', 'playwright-report', 'test-results']);
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.json', '.html', '.css', '.md', '.yml', '.yaml']);
const THIS_FILE = 'scripts/check-secrets.mjs';

const signatures = [
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'GitHub token', pattern: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: 'GitHub fine-grained token', pattern: /github_pat_[A-Za-z0-9_]{20,}/ },
  { name: 'AWS access key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'Stripe live secret', pattern: /sk_live_[A-Za-z0-9]{20,}/ },
  { name: 'Google API key', pattern: /AIza[0-9A-Za-z_-]{30,}/ },
];

const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(directory, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (TEXT_EXTENSIONS.has(extname(entry))) files.push(full);
  }
}
walk(ROOT);

let findings = 0;
for (const file of files) {
  const path = relative(ROOT, file).replaceAll('\\', '/');
  if (path === THIS_FILE) continue;
  const content = readFileSync(file, 'utf8');
  for (const signature of signatures) {
    if (signature.pattern.test(content)) {
      console.error(`${path}: possible ${signature.name} detected`);
      findings += 1;
    }
  }
}

if (findings) process.exit(1);
console.log(`Secret scan passed for ${files.length - 1} text files.`);

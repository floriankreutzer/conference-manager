import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const assetsDir = 'assets';
const tokenFile = join(assetsDir, 'tokens.css');
const componentCss = readdirSync(assetsDir)
  .filter((name) => name.endsWith('.css') && name !== 'tokens.css')
  .map((name) => join(assetsDir, name));

const hexPattern = /#[0-9a-f]{3,8}\b/gi;
let failures = 0;

for (const file of componentCss) {
  const source = readFileSync(file, 'utf8');
  const matches = [...source.matchAll(hexPattern)].map((match) => match[0]);
  if (matches.length) {
    console.error(`${file}: hard-coded hex colors found (${[...new Set(matches)].join(', ')}). Use assets/tokens.css.`);
    failures += 1;
  }
}

const tokens = readFileSync(tokenFile, 'utf8');
for (const requiredToken of ['--brand-primary', '--brand-secondary', '--color-surface-camel', '--color-border', '--focus-color']) {
  if (!tokens.includes(requiredToken)) {
    console.error(`${tokenFile}: required design token missing: ${requiredToken}`);
    failures += 1;
  }
}

const index = readFileSync('index.html', 'utf8');
const tokensPosition = index.indexOf('assets/tokens.css');
const stylesPosition = index.indexOf('assets/styles.css');
if (tokensPosition < 0 || stylesPosition < 0 || tokensPosition > stylesPosition) {
  console.error('index.html: tokens.css must load before component styles.');
  failures += 1;
}

if (failures) process.exit(1);
console.log(`Design-token check passed for ${componentCss.length} component stylesheets.`);

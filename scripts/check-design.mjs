import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const assetsDir = 'assets';
const tokenFile = join(assetsDir, 'tokens.css');
const manropeFontFile = join(assetsDir, 'fonts', 'Manrope[wght].ttf');
const manropeLicenseFile = join(assetsDir, 'fonts', 'OFL.txt');
const manropeFontlogFile = join(assetsDir, 'fonts', 'FONTLOG.txt');
const expectedManropeSha256 = 'd0639be45d0af36e798172419d7bd173c4bd4f29e2b76cbb69db1d11bf8b0a40';
const componentCss = readdirSync(assetsDir)
  .filter((name) => name.endsWith('.css') && name !== 'tokens.css')
  .map((name) => join(assetsDir, name));

const hexPattern = /#[0-9a-f]{3,8}\b/gi;
const fontFamilyPattern = /font-family\s*:\s*([^;]+);/gi;
const fontShorthandPattern = /\bfont\s*:\s*([^;]+);/gi;
const allowedComponentFontFamilies = new Set([
  'var(--font-family-sans)',
  'var(--font-family-display)',
  'inherit',
]);
const allowedComponentFontShorthands = new Set(['inherit']);
let failures = 0;

for (const file of componentCss) {
  const source = readFileSync(file, 'utf8');
  const matches = [...source.matchAll(hexPattern)].map((match) => match[0]);
  if (matches.length) {
    console.error(`${file}: hard-coded hex colors found (${[...new Set(matches)].join(', ')}). Use assets/tokens.css.`);
    failures += 1;
  }

  const fontFamilies = [...source.matchAll(fontFamilyPattern)].map((match) => match[1].trim());
  const uncontrolledFamilies = fontFamilies.filter((value) => !allowedComponentFontFamilies.has(value));
  if (uncontrolledFamilies.length) {
    console.error(`${file}: uncontrolled font-family declarations found (${[...new Set(uncontrolledFamilies)].join(', ')}). Use semantic typography tokens.`);
    failures += 1;
  }

  const fontShorthands = [...source.matchAll(fontShorthandPattern)].map((match) => match[1].trim());
  const uncontrolledShorthands = fontShorthands.filter((value) => !allowedComponentFontShorthands.has(value));
  if (uncontrolledShorthands.length) {
    console.error(`${file}: uncontrolled font shorthand declarations found (${[...new Set(uncontrolledShorthands)].join(', ')}). Use font: inherit or semantic typography-token longhands.`);
    failures += 1;
  }
}

const tokens = readFileSync(tokenFile, 'utf8');
for (const requiredToken of [
  '--brand-primary',
  '--brand-secondary',
  '--color-surface-camel',
  '--color-border',
  '--focus-color',
  '--font-family-display',
  '--font-family-sans',
]) {
  if (!tokens.includes(requiredToken)) {
    console.error(`${tokenFile}: required design token missing: ${requiredToken}`);
    failures += 1;
  }
}

const sansFamily = tokens.match(/--font-family-sans:\s*([^;]+);/)?.[1]?.trim();
const displayFamily = tokens.match(/--font-family-display:\s*([^;]+);/)?.[1]?.trim();
if (!sansFamily?.startsWith('"Inter",')) {
  console.error(`${tokenFile}: --font-family-sans must keep Inter as the primary functional UI family.`);
  failures += 1;
}
if (displayFamily !== '"Manrope", var(--font-family-sans)') {
  console.error(`${tokenFile}: --font-family-display must use Manrope and fall back through the functional UI family.`);
  failures += 1;
}

const fontFace = tokens.match(/@font-face\s*{([\s\S]*?)}/)?.[1] || '';
if (!fontFace.includes('url("./fonts/Manrope%5Bwght%5D.ttf")')) {
  console.error(`${tokenFile}: Manrope must be loaded from the repository-controlled same-origin font asset.`);
  failures += 1;
}
if (!fontFace.includes('font-display: swap;')) {
  console.error(`${tokenFile}: Manrope must define font-display: swap for graceful loading behavior.`);
  failures += 1;
}
if (/https?:\/\//i.test(fontFace)) {
  console.error(`${tokenFile}: remote font sources are not allowed in the design-token font-face contract.`);
  failures += 1;
}

if (!existsSync(manropeFontFile)) {
  console.error(`${manropeFontFile}: required self-hosted Manrope font asset is missing.`);
  failures += 1;
} else {
  const actualSha256 = createHash('sha256').update(readFileSync(manropeFontFile)).digest('hex');
  if (actualSha256 !== expectedManropeSha256) {
    console.error(`${manropeFontFile}: unexpected SHA-256 ${actualSha256}; review font provenance before updating the expected hash.`);
    failures += 1;
  }
}

for (const metadataFile of [manropeLicenseFile, manropeFontlogFile]) {
  if (!existsSync(metadataFile)) {
    console.error(`${metadataFile}: required Manrope licensing/provenance metadata is missing.`);
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
if (!index.includes('rel="preload" href="./assets/fonts/Manrope%5Bwght%5D.ttf" as="font" type="font/ttf" crossorigin')) {
  console.error('index.html: the same-origin Manrope asset must be preloaded before component styles.');
  failures += 1;
}
if (/fonts\.(?:googleapis|gstatic)\.com/i.test(`${tokens}\n${index}`)) {
  console.error('Runtime Google Fonts dependencies are not allowed; typography must remain same-origin and privacy-preserving.');
  failures += 1;
}

if (failures) process.exit(1);
console.log(`Design-token check passed for ${componentCss.length} component stylesheets, including the typography contract.`);

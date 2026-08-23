import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const files = {
  agents: 'AGENTS.md',
  standards: 'docs/CODING-STANDARDS.md',
  architecture: 'docs/ARCHITECTURE.md',
  baseline: 'docs/BASELINE.md',
  copilot: '.github/copilot-instructions.md',
  claude: 'CLAUDE.md',
  gemini: 'GEMINI.md',
};

const allowedInstructionFiles = new Set([
  files.agents,
  files.copilot,
  files.claude,
  files.gemini,
]);

const forbiddenParallelPaths = [
  '.cursorrules',
  '.windsurfrules',
  '.cursor/rules',
  '.windsurf/rules',
  '.github/instructions',
  '.github/agents',
];

const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'playwright-report',
  'test-results',
]);

let failures = 0;

function fail(message) {
  console.error(message);
  failures += 1;
}

function normalizePath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

function containsFiles(path) {
  if (!existsSync(path)) return false;
  if (!statSync(path).isDirectory()) return true;

  return readdirSync(path, { withFileTypes: true }).some((entry) => {
    const child = join(path, entry.name);
    return entry.isFile() || (entry.isDirectory() && containsFiles(child));
  });
}

function findUnexpectedInstructionFiles(directory = '.') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const absolutePath = join(directory, entry.name);
    const repositoryPath = normalizePath(relative('.', absolutePath));

    if (entry.isDirectory()) {
      findUnexpectedInstructionFiles(absolutePath);
      continue;
    }

    const isAgentInstructionFile =
      entry.name === 'AGENTS.md' ||
      entry.name === 'CLAUDE.md' ||
      entry.name === 'GEMINI.md' ||
      entry.name === 'copilot-instructions.md';

    if (isAgentInstructionFile && !allowedInstructionFiles.has(repositoryPath)) {
      fail(`${repositoryPath}: parallel agent instruction files are not allowed; use root AGENTS.md`);
    }
  }
}

for (const path of Object.values(files)) {
  if (!existsSync(path)) fail(`${path}: required repository governance file is missing`);
}

if (failures) process.exit(1);

for (const path of forbiddenParallelPaths) {
  if (containsFiles(path)) {
    fail(`${path}: parallel agent rules are not allowed; use root AGENTS.md`);
  }
}

findUnexpectedInstructionFiles();

const agents = readFileSync(files.agents, 'utf8');
const standards = readFileSync(files.standards, 'utf8');
const architecture = readFileSync(files.architecture, 'utf8');
const baseline = readFileSync(files.baseline, 'utf8');
const copilot = readFileSync(files.copilot, 'utf8');
const claude = readFileSync(files.claude, 'utf8').trim();
const gemini = readFileSync(files.gemini, 'utf8').trim();

const requiredAgentMarkers = [
  'docs/CODING-STANDARDS.md',
  'OpenAI Codex / ChatGPT',
  'GitHub Copilot',
  'Claude Code',
  'Gemini CLI',
  'Cursor',
  'Windsurf',
  'npm run check',
  'npm run audit',
  'npm run test:e2e',
  'Permanent modular architecture governance',
  '`src/app.js` is the Composition Root',
  '`src/employee/index.js`',
  '`src/manager/index.js`',
  'resulting `main` becomes the next functional and architectural baseline',
  'registered flags default OFF',
];

for (const marker of requiredAgentMarkers) {
  if (!agents.includes(marker)) fail(`${files.agents}: missing required marker: ${marker}`);
}

const agentLineCount = agents.split('\n').length;
if (agentLineCount > 220) {
  fail(`${files.agents}: keep the canonical entry point concise (current lines: ${agentLineCount}, maximum: 220)`);
}

for (let section = 1; section <= 23; section += 1) {
  if (!standards.includes(`## ${section}.`)) {
    fail(`${files.standards}: missing mandatory section ${section}`);
  }
}

const requiredArchitectureMarkers = [
  'Root `AGENTS.md` is the canonical repository instruction entry point',
  'current `main` branch is the functional and architectural baseline',
  '`src/app.js` is the application Composition Root',
  'public-API-only external capability consumption',
  'Core capability independence',
  'Architecture checks must represent architectural intent',
];
for (const marker of requiredArchitectureMarkers) {
  if (!architecture.includes(marker)) fail(`${files.architecture}: missing architecture-governance marker: ${marker}`);
}

const requiredBaselineMarkers = [
  'current `main` branch is the functional and architectural baseline',
  'resulting main becomes the next baseline',
  'Historical audit checkpoints',
];
for (const marker of requiredBaselineMarkers) {
  if (!baseline.includes(marker)) fail(`${files.baseline}: missing rolling-baseline marker: ${marker}`);
}

for (const obsoletePhrase of [
  'immutable functional baseline',
  'functional baseline for the modular architecture refactoring is',
]) {
  if (architecture.toLowerCase().includes(obsoletePhrase) || baseline.toLowerCase().includes(obsoletePhrase)) {
    fail(`Active architecture/baseline documentation must not define an obsolete fixed refactoring baseline: ${obsoletePhrase}`);
  }
}

if (!copilot.includes('AGENTS.md')) {
  fail(`${files.copilot}: must point GitHub Copilot to AGENTS.md`);
}
if (copilot.length > 2_000) {
  fail(`${files.copilot}: bridge must remain concise and must not duplicate the canonical standards`);
}

if (claude !== '@AGENTS.md') {
  fail(`${files.claude}: must import AGENTS.md exactly with @AGENTS.md`);
}

if (gemini !== '@./AGENTS.md') {
  fail(`${files.gemini}: must import AGENTS.md exactly with @./AGENTS.md`);
}

const instructionFiles = [agents, standards, copilot];
const forbiddenGermanMarkers = [
  'Agiere ',
  'Verbindliche Regeln',
  'Benutzeroberflächen',
  'erfüllt',
  'nicht relevant',
  'geprüft',
];

for (const marker of forbiddenGermanMarkers) {
  if (instructionFiles.some((content) => content.includes(marker))) {
    fail(`Repository agent instructions must remain English-only; found German marker: ${marker}`);
  }
}

if (failures) process.exit(1);
console.log('Agent-instruction and architecture-governance consistency check passed.');

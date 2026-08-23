import { existsSync, readFileSync } from 'node:fs';

const files = {
  agents: 'AGENTS.md',
  standards: 'docs/CODING-STANDARDS.md',
  copilot: '.github/copilot-instructions.md',
  claude: 'CLAUDE.md',
  gemini: 'GEMINI.md',
};

let failures = 0;

function fail(message) {
  console.error(message);
  failures += 1;
}

for (const path of Object.values(files)) {
  if (!existsSync(path)) fail(`${path}: required agent-instruction file is missing`);
}

if (failures) process.exit(1);

const agents = readFileSync(files.agents, 'utf8');
const standards = readFileSync(files.standards, 'utf8');
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
console.log('Agent-instruction consistency check passed.');

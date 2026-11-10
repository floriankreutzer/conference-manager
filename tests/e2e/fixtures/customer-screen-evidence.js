import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
let source;
function sourceIdentity() {
  if (source) return source;
  const githubSha = /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || '') ? process.env.GITHUB_SHA : null;
  source = { checkoutCommit: null, trackedWorkingTree: 'unavailable', githubSha,
    githubShaMeaning: process.env.GITHUB_EVENT_NAME === 'pull_request'
      ? 'pull-request merge source, separate from the checked-out commit' : 'workflow event source' };
  try {
    const options = { cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: 65536, stdio: ['ignore', 'pipe', 'pipe'] };
    source.checkoutCommit = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], options).trim();
    source.trackedWorkingTree = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], options).trim()
      ? 'modified' : 'clean';
  } catch { /* An unavailable checkout identity must remain explicit in local evidence. */ }
  return source;
}

// This records an already asserted fixture state, not live provider or product acceptance.
export async function attachCustomerScreenEvidence(page, testInfo, {
  screen, state, roles, name = null, surface = page, fullPage = true, composition = 'routed-protocol-fixture',
}) {
  const browser = page.context().browser();
  const presentation = await page.evaluate(() => ({ language: document.documentElement.lang,
    viewport: { width: innerWidth, height: innerHeight }, devicePixelRatio }));
  const attachment = name || `customer-screen-${screen}-${state}-${presentation.language}-${presentation.viewport.width}`;
  if (surface) {
    const body = surface === page ? await page.screenshot({ fullPage }) : await surface.screenshot();
    await testInfo.attach(attachment, { body, contentType: 'image/png' });
  }
  await testInfo.attach(`${attachment}-context`, { contentType: 'application/json', body: Buffer.from(JSON.stringify({
    screen, state, ...presentation, configuredViewport: page.viewportSize(), roles, roleSource: composition === 'routed-protocol-fixture'
      ? 'declared authenticated session in the routed test fixture' : 'declared component ownership; no authenticated backend',
    engine: browser?.browserType().name() || null, browserVersion: browser?.version() || null,
    project: testInfo.project.name, test: testInfo.title, composition,
    frontend: sourceIdentity(), apiCommit: null, apiEvidence: 'No real API counterpart; test-controlled responses or adapters',
    limits: 'Candidate interaction state only; no historical before/after, live provider, real-device Safari, zoom or product-acceptance claim',
  }, null, 2)) });
}

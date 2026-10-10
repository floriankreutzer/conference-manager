import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertManagedArtifactPath } from './redaction-guard.mjs';
import { requireAcceptanceAccess } from './acceptance-config.mjs';

export default function validateRunnerConfig(config) {
  function reject() { throw new Error('CM_ACCEPTANCE_RUNNER_CONFIG_REJECTED'); }
  const reporter = fileURLToPath(new URL('./safe-reporter.mjs', import.meta.url));
  if (config.workers !== 1 || config.reporter.length !== 1
    || path.resolve(config.reporter[0][0]) !== reporter || config.webServer) reject();
  requireAcceptanceAccess('https://conference-manager-demo.onrender.com');
  requireAcceptanceAccess('https://conference-manager-ops-demo.onrender.com');
  for (const project of config.projects) {
    assertManagedArtifactPath(project.outputDir);
    const use = project.use;
    if (project.retries !== 0 || use.trace !== 'off' || use.screenshot !== 'off'
      || (use.video !== undefined && use.video !== 'off') || use.ignoreHTTPSErrors !== false
      || ['extraHTTPHeaders', 'recordHar', 'recordVideo', 'proxy', 'connectOptions'].some((key) => use[key] !== undefined)) reject();
    if (use.launchOptions && Object.keys(use.launchOptions).length !== 0) reject();
  }
}

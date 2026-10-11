import { assertManagedArtifactPath, getSecretGuardStatus, writeManagedSummary,
  writeManagedScenarioEvidence } from './redaction-guard.mjs';

export default class AcceptanceReporter {
  constructor() {
    this.counts = { total: 0, passed: 0, failed: 0, skipped: 0, interrupted: 0, timedOut: 0 };
    this.failed = false;
  }
  onBegin(config) {
    try {
      if (config.reporter.length !== 1 || config.workers !== 1) throw new Error('invalid');
      for (const project of config.projects) {
        assertManagedArtifactPath(project.outputDir);
        if (project.retries !== 0 || project.use.trace !== 'off' || project.use.screenshot !== 'off'
          || (project.use.video !== undefined && project.use.video !== 'off') || project.use.ignoreHTTPSErrors !== false) throw new Error('invalid');
      }
    } catch { this.failed = true; }
  }
  onTestEnd(_test, result) {
    this.counts.total += 1;
    if (!Object.hasOwn(this.counts, result.status) || result.status === 'total') this.failed = true;
    else this.counts[result.status] += 1;
    for (const attachment of result.attachments) {
      try {
        // Playwright 1.63 materializes an undefined `path` for body attachments.
        // A real path or any new transport field remains outside the contract.
        if (attachment.path !== undefined
          || Object.keys(attachment).some((key) => !['name', 'body', 'contentType', 'path'].includes(key))) throw new Error('invalid');
        writeManagedScenarioEvidence({ name: attachment.name, body: attachment.body, contentType: attachment.contentType });
      } catch { this.failed = true; }
    }
  }
  onError() { this.failed = true; }
  onStdOut() {}
  onStdErr() {}
  onEnd(result) {
    const guard = getSecretGuardStatus();
    const status = this.failed || guard.guardBlockedWrites > 0 ? 'failed' : result.status;
    writeManagedSummary({ status, ...this.counts, guardBlockedWrites: guard.guardBlockedWrites });
    return { status };
  }
  printsToStdio() { return false; }
}

import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RUN_COMPONENT_PATTERN = /^\d{1,20}$/;

export function hostedResetRequestIdPath(env = process.env) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    throw new TypeError('HOSTED_DEMO_RUN_ENV_REQUIRED');
  }
  const runId = env.GITHUB_RUN_ID;
  const runAttempt = env.GITHUB_RUN_ATTEMPT;
  if (runId === undefined && runAttempt === undefined) return null;
  if (
    typeof runId !== 'string'
    || typeof runAttempt !== 'string'
    || !RUN_COMPONENT_PATTERN.test(runId)
    || !RUN_COMPONENT_PATTERN.test(runAttempt)
  ) throw new Error('HOSTED_DEMO_RUN_CONTEXT_INVALID');

  return join(
    tmpdir(),
    `conference-manager-hosted-demo-reset-${runId}-${runAttempt}.txt`,
  );
}

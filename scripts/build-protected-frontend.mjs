import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { buildProtectedFrontendArtifacts,writeProtectedFrontendArtifacts } from './protected-frontend-artifacts.mjs';

// Run in the reviewed frontend checkout. This command neither fetches code nor
// installs/runs a downloaded program. Output is public static source only.
const env=process.env,root=process.cwd(),destination=process.argv[2];
const apiCommit=env.PROTECTED_API_COMMIT,frontendCommit=env.PROTECTED_FRONTEND_COMMIT;
if (process.argv.length!==3 || !path.isAbsolute(destination ?? '') || !/^[a-f0-9]{40}$/.test(frontendCommit ?? '')) {
  throw new Error('PROTECTED_FRONTEND_BUILD_INPUT_REQUIRED');
}
const actual=execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8',timeout: 5000,maxBuffer: 1024 }).trim();
if (actual!==frontendCommit) throw new Error('PROTECTED_FRONTEND_BUILD_REF_MISMATCH');
const changes=execFileSync('git',['status','--porcelain','--untracked-files=normal'],{
  encoding: 'utf8',timeout: 5000,maxBuffer: 65536 });
if (changes.trim()) throw new Error('PROTECTED_FRONTEND_BUILD_DIRTY_CHECKOUT');
function flag(name) {
  const value=env[name] ?? 'false';if (!['true','false'].includes(value)) throw new Error('PROTECTED_FRONTEND_BUILD_FLAG_INVALID');
  return value==='true';
}
const built=await buildProtectedFrontendArtifacts({ root,apiCommit,frontendCommit,
  customerOrigin: env.PROTECTED_CUSTOMER_ORIGIN,platformOrigin: env.PROTECTED_PLATFORM_ORIGIN,
  environment: env.PROTECTED_ENVIRONMENT,syntheticEnabled: flag('PROTECTED_SYNTHETIC_ENABLED'),
  microsoftEnabled: flag('PROTECTED_PRESENTATION_MICROSOFT_ENABLED'),invitationsEnabled: flag('PROTECTED_PRESENTATION_INVITATIONS_ENABLED'),
  ownerAccessEnabled: flag('PROTECTED_OWNER_CUSTOMER_ACCESS_ENABLED') });
await writeProtectedFrontendArtifacts(built,destination);
console.log(JSON.stringify({ frontendCommit,apiCommit,manifestSha256: built.manifestDigests }));

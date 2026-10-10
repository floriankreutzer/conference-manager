import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const guard = fileURLToPath(new URL('../support/hosted-transport/redaction-guard.mjs', import.meta.url));
const base = `import fs from 'node:fs'; import fsp from 'node:fs/promises'; import path from 'node:path';
import assert from 'node:assert/strict'; import * as guard from ${JSON.stringify(new URL(`file://${guard}`).href)};
const root = process.env.CM_ACCEPTANCE_ARTIFACT_ROOT; const token = process.env.CM_DEMO_CUSTOMER_ACCEPTANCE_TOKEN;
`;
function run(source, { preload = true, prepare = () => {}, gate = true, sharedRoot } = {}) {
  const folder = sharedRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'cm-guard-test-'));
  const output = path.join(folder, 'artifacts');
  fs.mkdirSync(output, { recursive: true });
  prepare(folder, output);
  const env = { ...process.env, CM_ACCEPTANCE_ARTIFACT_ROOT: output,
    CM_ACCEPTANCE_SUMMARY_PATH: path.join(output, 'summary.json'),
    CM_DEMO_CUSTOMER_ACCEPTANCE_TOKEN: randomBytes(32).toString('hex'),
    CM_DEMO_PLATFORM_ACCEPTANCE_TOKEN: randomBytes(32).toString('hex') };
  delete env.NODE_OPTIONS;
  if (gate) env.CM_DEMO_ACCEPTANCE_MODE = 'gate'; else delete env.CM_DEMO_ACCEPTANCE_MODE;
  const result = spawnSync(process.execPath, [...(preload ? ['--import', guard] : []), '--input-type=module', '-e', base + source],
    { env, encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.stdout.includes(env.CM_DEMO_CUSTOMER_ACCEPTANCE_TOKEN), false);
  assert.equal(result.stderr.includes(env.CM_DEMO_CUSTOMER_ACCEPTANCE_TOKEN), false);
  return { ...result, folder, output, env };
}
function clean(result) { fs.rmSync(result.folder, { recursive: true, force: true }); }

test('explicit early preload is required; ungated imports have no effects', () => {
  const ordinary = run(`console.log('ordinary'); assert.equal(guard.getSecretGuardStatus().active, false);`, { preload: false, gate: false });
  assert.equal(ordinary.status, 0); assert.equal(ordinary.stdout, 'ordinary\n'); clean(ordinary);
  const late = run(`assert.throws(() => guard.assertSecretGuardActive([token]), /CM_ACCEPTANCE_GUARD_REQUIRED/);`, { preload: false });
  assert.equal(late.status, 0); clean(late);
});

test('actual stdout/stderr and descriptor sinks suppress whole and split canaries', () => {
  const result = run(`guard.assertSecretGuardActive([token]);
  process.stdout.write(token.slice(0, 20)); process.stdout.write(token.slice(20));
  process.stderr.write(token); console.error({ token }); fs.writeSync(1, token); fs.writeSync(2, token);
  let replaced = false; process.stdout.write = () => { replaced = true; }; process.stdout.write(token);
  process.stderr.write = () => { replaced = true; }; process.stderr.write(token); assert.equal(replaced, false);
  await fsp.writeFile(1, token); fs.writeFileSync(2, token);
  assert.equal(guard.getSecretGuardStatus().guardBlockedWrites, 0);`);
  assert.equal(result.status, 0); assert.equal(result.stdout, ''); assert.equal(result.stderr, ''); clean(result);
});

test('actual Playwright imports and graceful-fs-style descriptor clones cannot release guarded sinks', () => {
  const result = run(`
    const playwright = await import('@playwright/test'); assert.equal(typeof playwright.test, 'function');
    const clone = Object.defineProperties({}, Object.getOwnPropertyDescriptors(fs));
    let replaced = false; clone.createWriteStream = () => { replaced = true; };
    assert.throws(() => clone.createWriteStream(path.join(root, 'trace.zip')), /ARTIFACT_REJECTED/);
    fs.writeFileSync = () => { replaced = true; };
    assert.throws(() => fs.writeFileSync(path.join(root, 'error-context.md'), token), /ARTIFACT_REJECTED/);
    assert.equal(replaced, false); assert.equal(guard.getSecretGuardStatus().guardBlockedWrites, 2);
    guard.assertSecretGuardActive([token]);
  `);
  assert.equal(result.status, 0); assert.equal(result.stdout, ''); assert.equal(result.stderr, ''); clean(result);
});

test('native uncaught exception and unhandled rejection terminate without payload output', () => {
  for (const statement of [`throw new Error(token);`, `Promise.reject(new Error(token)); await new Promise(r => setTimeout(r, 20));`]) {
    const result = run(statement);
    assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.equal(result.stderr, ''); clean(result);
  }
});

test('managed writes reject before persistence through real filesystem sinks', () => {
  const result = run(`
    const target = path.join(root, 'error-context.md');
    assert.throws(() => fs.writeFileSync(target, token), /ARTIFACT_REJECTED/);
    await assert.rejects(fsp.writeFile(target, token), /ARTIFACT_REJECTED/);
    assert.throws(() => fs.appendFileSync(target, token), /ARTIFACT_REJECTED/);
    assert.throws(() => fs.createWriteStream(target), /ARTIFACT_REJECTED/);
    assert.throws(() => fs.openSync(target, 'w'), /ARTIFACT_REJECTED/);
    await assert.rejects(fsp.open(target, 'a'), /ARTIFACT_REJECTED/);
    assert.throws(() => fs.copyFileSync(path.join(root, '..', 'input'), target), /ARTIFACT_REJECTED/);
    assert.throws(() => fs.renameSync(path.join(root, '..', 'input'), target), /ARTIFACT_REJECTED/);
    assert.throws(() => fs.linkSync(path.join(root, '..', 'input'), target), /ARTIFACT_REJECTED/);
    assert.throws(() => fs.symlinkSync(path.join(root, '..', 'input'), target), /ARTIFACT_REJECTED/);
    assert.equal(fs.existsSync(target), false);
    assert.equal(guard.getSecretGuardStatus().guardBlockedWrites, 10);
    fs.writeFileSync(path.join(root, '..', 'compiler-cache'), 'ordinary');
  `, { prepare(folder) { fs.writeFileSync(path.join(folder, 'input'), 'fixture'); } });
  assert.equal(result.status, 0); assert.equal(fs.existsSync(path.join(result.output, 'error-context.md')), false);
  assert.equal(fs.readFileSync(path.join(result.folder, 'compiler-cache'), 'utf8'), 'ordinary'); clean(result);
});

test('lexical managed paths cannot escape through existing symlinks', () => {
  const result = run(`
    assert.throws(() => fs.writeFileSync(path.join(root, 'escape', 'leak'), token), /ARTIFACT_REJECTED/);
    assert.throws(() => fs.writeFileSync(path.join(root, 'escape', '.last-run.json'), JSON.stringify({status:'passed',failedTests:[]})), /ARTIFACT_REJECTED/);
    assert.throws(() => guard.assertManagedArtifactPath(path.join(root, 'escape', 'safe.json')), /ARTIFACT_PATH_REJECTED/);
  `, { prepare(folder, output) { fs.mkdirSync(path.join(folder, 'outside')); fs.symlinkSync(path.join(folder, 'outside'), path.join(output, 'escape')); } });
  assert.equal(result.status, 0); assert.deepEqual(fs.readdirSync(path.join(result.folder, 'outside')), []); clean(result);
});

test('only closed last-run metadata and validated summary can persist', () => {
  const result = run(`
    await fsp.writeFile(path.join(root, '.last-run.json'), JSON.stringify({status:'passed',failedTests:[]}));
    guard.writeManagedSummary({status:'passed',total:1,passed:1,failed:0,skipped:0,interrupted:0,timedOut:0,guardBlockedWrites:0});
    assert.throws(() => guard.writeManagedSummary({status:'passed',total:1,passed:1,failed:0,skipped:0,interrupted:0,timedOut:0,guardBlockedWrites:0, error:token}), /SUMMARY_REJECTED/);
  `);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.output, 'summary.json'))).status, 'passed'); clean(result);
});

test('blocked-write latch crosses worker processes and prevents passed aggregate summary', () => {
  const first = run(`try { fs.writeFileSync(path.join(root,'error-context.md'), token); } catch {}`);
  assert.equal(first.status, 0);
  const second = run(`
    assert.equal(guard.getSecretGuardStatus().guardBlockedWrites, 1);
    const summary = {status:'passed',total:1,passed:1,failed:0,skipped:0,interrupted:0,timedOut:0,guardBlockedWrites:1};
    assert.throws(() => guard.writeManagedSummary(summary), /SUMMARY_REJECTED/);
    guard.writeManagedSummary({...summary,status:'failed'});
  `, { sharedRoot: first.folder });
  assert.equal(second.status, 0); assert.equal(JSON.parse(fs.readFileSync(path.join(second.output, 'summary.json'))).status, 'failed'); clean(second);
});

test('scenario evidence retains all two-cycle canonical assertions; binary and extra fields reject', () => {
  const result = run(`
    const checksum = '7e22005f1e9689fbea4ccfc75084f5f3d224fe10e60a6af23c1cb600f2b70014';
    const evidence = {schemaVersion:1,browser:'chromium-hosted-demo',seedVersion:'saas-3.7-three-demo-customers-v1',checksum,
      cycles:[1,2].map(cycle=>({cycle,northwindRooms:10,northwindSeedRequests:20,contosoTasksCompleted:7,fabrikamRoomsImported:2,allThreeRestored:true,checksum})),cleanupVerified:true};
    const attachment = {name:'saas37-scenario-evidence',body:Buffer.from(JSON.stringify(evidence)),contentType:'application/json'};
    guard.writeManagedScenarioEvidence(attachment);
    assert.throws(() => guard.validateScenarioEvidence({...attachment,path:'arbitrary'}), /ARTIFACT_REJECTED/);
    const {gzipSync} = await import('node:zlib');
    assert.throws(() => guard.validateScenarioEvidence({...attachment,body:gzipSync(token)}), /ARTIFACT_REJECTED/);
    assert.throws(() => guard.validateScenarioEvidence({...attachment,body:Buffer.from(JSON.stringify({...evidence,payload:token}))}), /ARTIFACT_REJECTED/);
    assert.throws(() => guard.validateScenarioEvidence({...attachment,body:Buffer.from(JSON.stringify({...evidence,cycles:[evidence.cycles[0]]}))}), /ARTIFACT_REJECTED/);
    assert.equal(guard.getSecretGuardStatus().guardBlockedWrites, 4);
  `);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.output, 'scenario-chromium-hosted-demo.json'))).cycles.length, 2); clean(result);
});

test('reset correlation and audit writers retain only original bounded diagnostic fields', () => {
  const result = run(`
    const requestId = '11111111-1111-4111-8111-111111111111';
    guard.writeManagedResetCorrelation({requestId});
    guard.writeManagedResetAudit({reasonCode:'media_registration_failed',correlationId:requestId,occurredAt:'2026-10-10T18:00:00.000Z'});
    assert.throws(() => guard.writeManagedResetCorrelation({requestId:token}), /RESET_EVIDENCE_REJECTED/);
    assert.throws(() => guard.writeManagedResetAudit({reasonCode:token,correlationId:requestId,occurredAt:'2026-10-10T18:00:00.000Z'}), /RESET_EVIDENCE_REJECTED/);
    assert.throws(() => guard.writeManagedResetAudit({reasonCode:null,correlationId:null,occurredAt:'2026-10-10T18:00:00.000Z'}), /RESET_EVIDENCE_REJECTED/);
  `);
  assert.equal(result.status, 0); assert.equal(JSON.parse(fs.readFileSync(path.join(result.output,'reset-audit.json'))).reasonCode,'media_registration_failed'); clean(result);
  const unavailable = run(`guard.writeManagedResetAudit({reasonCode:null,correlationId:null,occurredAt:null});`);
  assert.equal(unavailable.status, 0); clean(unavailable);
});

test('journey evidence retains phase and cleanup outcomes using fixed enums only', () => {
  const result = run(`
    const evidence = {schemaVersion:1,readiness:'passed',initialIdentity:'passed',reserve:'passed',
      shared:'failed',scenarios:'not_started',cleanup:'passed',finalIdentity:'passed',resetAudit:'matched'};
    guard.writeManagedJourneyEvidence(evidence);
    assert.throws(() => guard.writeManagedJourneyEvidence({...evidence,cleanup:token}), /JOURNEY_EVIDENCE_REJECTED/);
    assert.throws(() => guard.writeManagedJourneyEvidence({...evidence,error:token}), /JOURNEY_EVIDENCE_REJECTED/);
    assert.throws(() => guard.writeManagedJourneyEvidence({...evidence,resetAudit:'passed'}), /JOURNEY_EVIDENCE_REJECTED/);
  `);
  assert.equal(result.status, 0);
  const evidence = JSON.parse(fs.readFileSync(path.join(result.output,'journey-phases.json')));
  assert.equal(evidence.shared,'failed'); assert.equal(evidence.cleanup,'passed'); clean(result);
});

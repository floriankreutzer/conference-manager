import { mkdtemp,mkdir,writeFile,access,rm } from 'node:fs/promises';
import { spawnSync,spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import path from 'node:path';
import os from 'node:os';

const project=process.argv[2];
if (process.argv.length!==3 || !['chromium-protected','webkit-protected'].includes(project)) {
  throw new Error('PROTECTED_BROWSER_PROJECT_REQUIRED');
}
const root=process.cwd(),apiRoot=path.resolve(root,'../api'),expected=process.env.PROTECTED_BROWSER_API_REF;
function command(program,args,{ capture=false }={}) {
  const result=spawnSync(program,args,{ encoding: 'utf8',stdio: capture ? 'pipe' : 'ignore',timeout: 30000,maxBuffer: 65536 });
  if (result.status!==0) throw new Error('PROTECTED_BROWSER_SETUP_COMMAND_FAILED');
  return capture ? result.stdout.trim() : undefined;
}
const apiCommit=command('git',['-C',apiRoot,'rev-parse','HEAD'],{ capture: true });
const frontendCommit=command('git',['rev-parse','HEAD'],{ capture: true });
if (!/^[a-f0-9]{40}$/.test(expected ?? '') || apiCommit!==expected || !/^[a-f0-9]{40}$/.test(frontendCommit)) {
  throw new Error('PROTECTED_BROWSER_IMMUTABLE_REF_MISMATCH');
}
const databaseUrl=new URL(process.env.DATABASE_URL ?? 'invalid:');
if (!['postgres:','postgresql:'].includes(databaseUrl.protocol) || databaseUrl.hostname!=='127.0.0.1'
  || databaseUrl.pathname!=='/postgres' || databaseUrl.search || databaseUrl.hash) {
  throw new Error('PROTECTED_BROWSER_LOOPBACK_HARNESS_REQUIRED');
}
const directory=await mkdtemp(path.join(os.tmpdir(),'cm-qualified-browser-')),certificateName=`cm-qualified-browser-${randomUUID()}`;
const nss=path.join(os.homedir(),'.pki','nssdb'),systemCertificate=`/usr/local/share/ca-certificates/${certificateName}.crt`;
const require=createRequire(path.join(apiRoot,'package.json')),{ Client }=require('pg');
const client=new Client({ connectionString: databaseUrl.href,connectionTimeoutMillis: 2000,query_timeout: 10000 });
const databaseName=`conference_manager_test_${process.pid}_0`;let created=false,nssInstalled=false,systemInstalled=false;
try {
  await client.connect();await client.query(`CREATE DATABASE "${databaseName}"`);created=true;
  command('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=CM qualified acceptance CA',
    '-keyout',path.join(directory,'ca.key'),'-out',path.join(directory,'ca.crt')]);
  await writeFile(path.join(directory,'extensions.cnf'),
    'subjectAltName=DNS:app-int.example.test,DNS:ops-int.example.com\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n');
  command('openssl',['req','-newkey','rsa:2048','-nodes','-subj','/CN=ops-int.example.com',
    '-keyout',path.join(directory,'server.key'),'-out',path.join(directory,'server.csr')]);
  command('openssl',['x509','-req','-in',path.join(directory,'server.csr'),'-CA',path.join(directory,'ca.crt'),
    '-CAkey',path.join(directory,'ca.key'),'-CAcreateserial','-days','1','-extfile',path.join(directory,'extensions.cnf'),
    '-out',path.join(directory,'server.crt')]);
  await mkdir(nss,{ recursive: true });try { await access(path.join(nss,'cert9.db')); }
  catch { command('certutil',['-N','--empty-password','-d',`sql:${nss}`]); }
  command('certutil',['-A','-n',certificateName,'-t','C,,','-d',`sql:${nss}`,'-i',path.join(directory,'ca.crt')]);nssInstalled=true;
  command('sudo',['-n','install','-m','0644',path.join(directory,'ca.crt'),systemCertificate]);systemInstalled=true;
  command('sudo',['-n','update-ca-certificates']);
  const testUrl=new URL(databaseUrl);testUrl.pathname=`/${databaseName}`;
  const env={ ...process.env,NODE_EXTRA_CA_CERTS: path.join(directory,'ca.crt'),DATABASE_URL: testUrl.href,
    CM_PROTECTED_API_ROOT: apiRoot,CM_PROTECTED_API_COMMIT: apiCommit,CM_PROTECTED_FRONTEND_COMMIT: frontendCommit,
    CM_PROTECTED_CERTIFICATE_DIRECTORY: directory };delete env.NODE_OPTIONS;
  const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test',
    '--config=playwright.protected.config.js',`--project=${project}`],{ env,stdio: 'inherit' });
  const [status]=await once(child,'exit');if (status!==0) process.exitCode=1;
} finally {
  let failed=false;
  function clean(program,args) { try { command(program,args); } catch { failed=true; } }
  if (nssInstalled) clean('certutil',['-D','-n',certificateName,'-d',`sql:${nss}`]);
  if (systemInstalled) { clean('sudo',['-n','rm','--',systemCertificate]);clean('sudo',['-n','update-ca-certificates']); }
  try { if (created) await client.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`); } catch { failed=true; }
  try { await client.end(); } catch { failed=true; }
  try { await rm(directory,{ recursive: true,force: true }); } catch { failed=true; }
  if (failed) { process.exitCode=1;console.error('PROTECTED_BROWSER_CLEANUP_FAILED'); }
}

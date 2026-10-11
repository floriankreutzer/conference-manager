import { mkdtemp, writeFile, rm, mkdir, access } from 'node:fs/promises';
import { spawnSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const browserMode = process.argv.includes('--browsers');
if (process.argv.slice(2).some((argument) => argument !== '--browsers')) throw new Error('CM_TRANSPORT_ARGUMENT_INVALID');
const directory = await mkdtemp(path.join(os.tmpdir(), 'cm-transport-'));
const certificateName = `cm-transport-${randomUUID()}`;
const nss = path.join(os.homedir(), '.pki', 'nssdb');
const systemCertificate = `/usr/local/share/ca-certificates/${certificateName}.crt`;
let nssInstalled = false;
let systemInstalled = false;
function command(executable, args) {
  const result = spawnSync(executable, args, { stdio: 'ignore' });
  if (result.status !== 0) throw new Error(`CM_TRANSPORT_SETUP_FAILED_${executable.replace(/[^A-Za-z]/g, '').toUpperCase()}`);
}
try {
  command('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=CM isolated transport CA',
    '-keyout', path.join(directory, 'ca.key'), '-out', path.join(directory, 'ca.crt')]);
  const extension = path.join(directory, 'extensions.cnf');
  await writeFile(extension, 'subjectAltName=DNS:customer.cm-transport.test,DNS:platform.cm-transport.test\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n');
  command('openssl', ['req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=customer.cm-transport.test',
    '-keyout', path.join(directory, 'server.key'), '-out', path.join(directory, 'server.csr')]);
  command('openssl', ['x509', '-req', '-in', path.join(directory, 'server.csr'), '-CA', path.join(directory, 'ca.crt'),
    '-CAkey', path.join(directory, 'ca.key'), '-CAcreateserial', '-days', '1', '-extfile', extension, '-out', path.join(directory, 'server.crt')]);
  command('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=customer.cm-transport.test',
    '-addext', 'subjectAltName=DNS:customer.cm-transport.test', '-keyout', path.join(directory, 'untrusted.key'), '-out', path.join(directory, 'untrusted.crt')]);
  if (browserMode) {
    // A temporary test CA is normal trust, not disabled certificate verification.
    // No HTTPS endpoint is intercepted; all test endpoints bind loopback only.
    await mkdir(nss, { recursive: true });
    try { await access(path.join(nss, 'cert9.db')); }
    catch { command('certutil', ['-N', '--empty-password', '-d', `sql:${nss}`]); }
    command('certutil', ['-A', '-n', certificateName, '-t', 'C,,', '-d', `sql:${nss}`, '-i', path.join(directory, 'ca.crt')]);
    nssInstalled = true;
    command('sudo', ['-n', 'install', '-m', '0644', path.join(directory, 'ca.crt'), systemCertificate]);
    systemInstalled = true;
    command('sudo', ['-n', 'update-ca-certificates']);
  }
  const args = ['--test', 'tests/hosted-transport/tls-egress.test.mjs', 'tests/hosted-transport/api-boundary.test.mjs',
    'tests/hosted-transport/fixture-binding.test.mjs', 'tests/hosted-transport/managed-runner.test.mjs',
    'tests/hosted-transport/redaction-guard.test.mjs'];
  if (browserMode) args.push('tests/hosted-transport/browser-boundary.test.mjs');
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env,
    NODE_EXTRA_CA_CERTS: path.join(directory, 'ca.crt'), CM_TRANSPORT_TEST_DIRECTORY: directory,
    CM_TRANSPORT_BROWSERS: browserMode ? '1' : '0',
    CM_DEMO_CUSTOMER_ACCEPTANCE_TOKEN: randomBytes(32).toString('hex'),
    CM_DEMO_PLATFORM_ACCEPTANCE_TOKEN: randomBytes(32).toString('hex') } });
  const [status] = await once(child, 'exit'); process.exitCode = status === 0 ? 0 : 1;
} finally {
  const cleanupFailures = [];
  function cleanup(label, operation) { try { operation(); } catch { cleanupFailures.push(label); } }
  if (nssInstalled) cleanup('NSS', () => command('certutil', ['-D', '-n', certificateName, '-d', `sql:${nss}`]));
  if (systemInstalled) {
    cleanup('SYSTEM_CA', () => command('sudo', ['-n', 'rm', '--', systemCertificate]));
    cleanup('SYSTEM_TRUST_REFRESH', () => command('sudo', ['-n', 'update-ca-certificates']));
  }
  try { await rm(directory, { recursive: true, force: true }); } catch { cleanupFailures.push('TEMPORARY_KEYS'); }
  if (cleanupFailures.length) { process.exitCode = 1; console.error(`CM_TRANSPORT_CLEANUP_FAILED_${cleanupFailures.join('_')}`); }
}

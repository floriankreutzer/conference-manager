import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import original from '../playwright.config.js';
import capture from '../playwright.guest-print-capture.config.js';
import {
  GUEST_CAPTURE_CSP, GUEST_CAPTURE_ORIGIN, GUEST_CAPTURE_PROJECTS,
  GUEST_CAPTURE_STYLES, GUEST_CAPTURE_URL, GUEST_PRIVATE_FIXTURES,
  observeGuestPrintResponses, validateGuestCaptureSnapshot,
  validateGuestSourceBinding, verifyGuestCaptureStyles,
} from './e2e/fixtures/guest-print-source-capture.js';

const publicFields = [
  'A private event', 'Public room', 'Public site', 'Public address', 'Public building',
  'Public city', 'Public reception', 'guest@example.test', '+49 30 555 0100',
  'Credentials provided on arrival',
];

function snapshot(language = 'en') {
  return {
    url: GUEST_CAPTURE_URL, language, title: 'Public guest information',
    csp: GUEST_CAPTURE_CSP,
    styles: GUEST_CAPTURE_STYLES.map((name) => GUEST_CAPTURE_ORIGIN + '/' + name),
    ready: true, safeStructure: true, openerDetached: true,
    html: '<!DOCTYPE html>\n<html lang="' + language + '"><head><title>Public</title></head><body>'
      + publicFields.join(' ') + '</body></html>',
    text: publicFields.join(' '),
  };
}

function resources() {
  return new Map(GUEST_CAPTURE_STYLES.map((name) => [
    GUEST_CAPTURE_ORIGIN + '/' + name,
    [Promise.resolve({ status: 200, contentType: 'text/css; charset=utf-8', redirected: false,
      body: readFileSync(new URL('../' + name, import.meta.url)) })],
  ]));
}

test('H keeps both original engine projects, no retries, exact original cases and normal TLS', () => {
  assert.deepEqual(capture.projects, original.projects);
  assert.deepEqual(capture.projects.map(({ name }) => name), GUEST_CAPTURE_PROJECTS);
  assert.equal(capture.workers, original.workers);
  assert.equal(capture.retries, 0);
  assert.equal(capture.forbidOnly, true);
  assert.equal(capture.use.ignoreHTTPSErrors, false);
  assert.equal(capture.webServer, undefined);
  assert.equal(capture.use.trace, 'off');
  for (const language of ['de', 'en']) {
    assert.equal(capture.grep.test('CO-317: EMP-14 EMP-15 bounded public content keeps every field in multipage A4 and print CSS in ' + language), true);
  }
  assert.equal(capture.grep.test('CO-317: another print case'), false);
});

test('H accepts both original public-language snapshots without a blanket private-text exclusion', () => {
  for (const language of ['de', 'en']) {
    const observed = snapshot(language);
    assert.equal(validateGuestCaptureSnapshot(observed, language, publicFields, GUEST_PRIVATE_FIXTURES), observed);
  }
});

test('H rejects drift in the original origin, CSP, resources, readiness or complete public document', () => {
  const mutations = [
    (value) => { value.url = value.url.replace('https:', 'http:'); },
    (value) => { value.url = value.url.replace('conference.test', 'conference.test:4443'); },
    (value) => { value.language = 'fr'; },
    (value) => { value.csp += "; script-src 'unsafe-inline'"; },
    (value) => { value.styles.reverse(); },
    (value) => { value.ready = false; },
    (value) => { value.safeStructure = false; },
    (value) => { value.openerDetached = false; },
    (value) => { value.html = 'x'.repeat(65_537); },
    (value) => { value.title = ''; },
    (value) => { value.text = publicFields.slice(1).join(' '); },
  ];
  for (const mutate of mutations) {
    const observed = snapshot();
    mutate(observed);
    assert.throws(() => validateGuestCaptureSnapshot(observed, 'en', publicFields, GUEST_PRIVATE_FIXTURES));
  }
});

test('H retains all six exact existing fixture privacy boundaries in text and serialized attributes', () => {
  const fixture = readFileSync(new URL('./e2e/production-application.spec.js', import.meta.url), 'utf8');
  for (const value of GUEST_PRIVATE_FIXTURES) {
    assert.ok(fixture.includes(value), 'Existing fixture sentinel must remain the source');
    for (const field of ['text', 'html']) {
      const observed = snapshot();
      observed[field] += value;
      assert.throws(() => validateGuestCaptureSnapshot(observed, 'en', publicFields, GUEST_PRIVATE_FIXTURES));
    }
  }
  assert.throws(() => validateGuestCaptureSnapshot(snapshot(), 'en', publicFields, GUEST_PRIVATE_FIXTURES.slice(1)));
});

test('H binds the two actual CSS response bodies to immutable product Git bytes', async () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const styles = await verifyGuestCaptureStyles(resources(), head);
  assert.equal(styles.length, 2);
  for (const [index, style] of styles.entries()) {
    assert.equal(style.sourcePath, GUEST_CAPTURE_STYLES[index]);
    assert.equal(style.bytes, style.body.length);
    assert.match(style.sha256, /^[a-f0-9]{64}$/u);
    assert.match(style.gitBlob, /^[a-f0-9]{40}$/u);
  }
});

test('H rejects missing, duplicate, redirected, altered or failed stylesheet responses', async () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const url = GUEST_CAPTURE_ORIGIN + '/' + GUEST_CAPTURE_STYLES[0];
  for (const mutate of [
    (value) => value.delete(url),
    (value) => value.set(url, [...value.get(url), ...value.get(url)]),
    (value) => value.set(url, [Promise.resolve({ failed: true })]),
    (value) => value.set(url, [value.get(url)[0].then((entry) => ({ ...entry, redirected: true }))]),
    (value) => value.set(url, [value.get(url)[0].then((entry) => ({ ...entry, status: 304 }))]),
    (value) => value.set(url, [value.get(url)[0].then((entry) => ({ ...entry, contentType: 'text/html' }))]),
    (value) => value.set(url, [value.get(url)[0].then((entry) => ({ ...entry, body: Buffer.from('changed') }))]),
  ]) {
    const value = resources();
    mutate(value);
    await assert.rejects(verifyGuestCaptureStyles(value, head));
  }
});

test('H installs observation only in explicitly selected capture runs and only once per context', () => {
  const previous = process.env.CM_GUEST_CAPTURE;
  const listeners = [];
  const context = { on: (event, listener) => listeners.push({ event, listener }) };
  try {
    delete process.env.CM_GUEST_CAPTURE;
    observeGuestPrintResponses(context);
    assert.equal(listeners.length, 0);
    process.env.CM_GUEST_CAPTURE = '1';
    observeGuestPrintResponses(context);
    assert.equal(listeners.length, 1);
    assert.equal(listeners[0].event, 'response');
    assert.throws(() => observeGuestPrintResponses(context));
  } finally {
    if (previous === undefined) delete process.env.CM_GUEST_CAPTURE;
    else process.env.CM_GUEST_CAPTURE = previous;
  }
});

test('H rejects malformed source bindings before invoking Git', () => {
  for (const pair of [[undefined, undefined], ['main', 'a'.repeat(40)],
    ['a'.repeat(40), 'refs/heads/main'], ['A'.repeat(40), 'b'.repeat(40)]]) {
    assert.throws(() => validateGuestSourceBinding(...pair));
  }
});

test('H GTK source, privilege, server cleanup and real-PDF boundary regressions pass offline', () => {
  execFileSync('python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'guest_print_webkitgtk_test.py'],
    { timeout: 90_000, maxBuffer: 1_048_576, stdio: 'pipe' });
});

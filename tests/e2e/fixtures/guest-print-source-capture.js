import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GUEST_CAPTURE_ORIGIN = 'https://conference.test';
export const GUEST_CAPTURE_URL = GUEST_CAPTURE_ORIGIN + '/src/shared/detached-print.html';
export const GUEST_CAPTURE_STYLES = ['assets/tokens.css', 'assets/employee-ux.css'];
export const GUEST_CAPTURE_PROJECTS = ['chromium-desktop', 'webkit-mobile'];
export const GUEST_CAPTURE_CSP = [
  "default-src 'none'", "script-src 'none'",
  'style-src ' + GUEST_CAPTURE_STYLES.map((name) => GUEST_CAPTURE_ORIGIN + '/' + name).join(' '),
  "style-src-attr 'none'", "img-src 'none'", "font-src 'none'", "connect-src 'none'",
  "media-src 'none'", "object-src 'none'", "frame-src 'none'", "child-src 'none'",
  "worker-src 'none'", "manifest-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');
export const GUEST_PRIVATE_FIXTURES = [
  '66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222', 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
  'PRIVATE_REQUEST_REQUIREMENTS_SENTINEL', 'PRIVATE_DIETARY_SENTINEL',
];
export const GUEST_HARNESS_PATHS = [
  '.github/workflows/guest-print-evidence.yml', '.github/workflows/webkitgtk-print-probe.yml',
  'docs/GUEST-PRINT-WEBKITGTK-EVIDENCE.md', 'docs/WEBKITGTK-SYNTHETIC-PRINT-PROBE.md',
  'playwright.guest-print-capture.config.js', 'scripts/probe-webkitgtk-print.py',
  'scripts/probe-webkitgtk-guest-print.py', 'tests/e2e/fixtures/guest-print-evidence.js',
  'tests/e2e/fixtures/guest-print-source-capture.js', 'tests/guest-print-source-capture.test.js',
  'tests/guest_print_webkitgtk_test.py', 'tests/webkitgtk-print-probe.test.js',
  'tests/webkitgtk_print_probe_test.py',
];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const observations = new WeakMap();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const blob = (bytes) => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');

function git(...arguments_) {
  return execFileSync('git', arguments_, { cwd: ROOT, timeout: 10_000, maxBuffer: 1_048_576 });
}

export function validateGuestSourceBinding(productSha, captureSha) {
  assert.match(productSha || '', /^[a-f0-9]{40}$/u, 'Exact product source required');
  assert.match(captureSha || '', /^[a-f0-9]{40}$/u, 'Exact capture source required');
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), captureSha, 'Capture checkout mismatch');
  git('merge-base', '--is-ancestor', productSha, captureSha);
  git('diff', '--quiet', 'HEAD', '--');
  const changed = git('diff', '--name-only', '--no-renames', productSha, captureSha, '--').toString().trim().split('\n').filter(Boolean);
  assert.ok(changed.length > 0 && changed.every((name) => GUEST_HARNESS_PATHS.includes(name)),
    'Only declared harness changes may differ from the product source');
  return {
    productSourceSha: productSha, productTreeSha: git('rev-parse', productSha + '^{tree}').toString().trim(),
    captureSourceSha: captureSha, captureTreeSha: git('rev-parse', captureSha + '^{tree}').toString().trim(),
  };
}

export function observeGuestPrintResponses(context) {
  if (process.env.CM_GUEST_CAPTURE !== '1') return;
  assert.equal(observations.has(context), false, 'Capture observer must be installed once');
  const pages = new WeakMap();
  observations.set(context, pages);
  context.on('response', (response) => {
    if (!GUEST_CAPTURE_STYLES.some((name) => response.url() === GUEST_CAPTURE_ORIGIN + '/' + name)) return;
    const frame = response.frame();
    if (frame.parentFrame()) return;
    const page = frame.page();
    const resources = pages.get(page) || new Map();
    pages.set(page, resources);
    const entries = resources.get(response.url()) || [];
    resources.set(response.url(), entries);
    // Settle immediately so a failed body read cannot become an unhandled rejection.
    entries.push(response.body().then((body) => ({
      body, status: response.status(), contentType: response.headers()['content-type'],
      redirected: response.request().redirectedFrom() !== null,
    }), () => ({ failed: true })));
  });
}

export function validateGuestCaptureSnapshot(snapshot, language, expectedText, excludedText) {
  assert.ok(['de', 'en'].includes(language), 'Unknown capture language');
  assert.deepEqual(excludedText, GUEST_PRIVATE_FIXTURES, 'Original fixture privacy checks required');
  assert.ok(Array.isArray(expectedText) && expectedText.length === 10
    && expectedText.every((value) => typeof value === 'string' && value.length > 0 && value.length <= 512),
  'Original bounded public field checks required');
  assert.equal(snapshot.url, GUEST_CAPTURE_URL, 'Original popup URL required');
  assert.equal(snapshot.language, language, 'Original document language required');
  assert.equal(snapshot.csp, GUEST_CAPTURE_CSP, 'Original restrictive CSP required');
  assert.deepEqual(snapshot.styles, GUEST_CAPTURE_STYLES.map((name) => GUEST_CAPTURE_ORIGIN + '/' + name));
  assert.equal(snapshot.ready, true, 'Original styles and public document must be ready');
  assert.equal(snapshot.safeStructure, true, 'Unexpected active or private document structure');
  assert.equal(snapshot.openerDetached, true, 'Original detached window required');
  assert.ok(typeof snapshot.html === 'string' && Buffer.byteLength(snapshot.html) <= 65_536
    && snapshot.html.startsWith('<!DOCTYPE html>\n<html'), 'Bounded full original DOM required');
  assert.ok(typeof snapshot.title === 'string' && snapshot.title.length > 0 && snapshot.title.length <= 256);
  assert.ok(typeof snapshot.text === 'string' && snapshot.text.length <= 32_768);
  for (const value of expectedText) assert.ok(snapshot.text.includes(value), 'Missing original public field');
  for (const value of excludedText) {
    assert.ok(!snapshot.text.includes(value) && !snapshot.html.includes(value), 'Fixture privacy boundary failed');
  }
  return snapshot;
}

export async function verifyGuestCaptureStyles(resources, productSha) {
  assert.match(productSha || '', /^[a-f0-9]{40}$/u, 'Exact CSS source required');
  assert.ok(resources instanceof Map && resources.size === 2, 'Exactly two original CSS responses required');
  const styles = [];
  for (const sourcePath of GUEST_CAPTURE_STYLES) {
    const url = GUEST_CAPTURE_ORIGIN + '/' + sourcePath;
    const entries = resources.get(url);
    assert.ok(Array.isArray(entries) && entries.length === 1, 'Each popup stylesheet must have one original response');
    const response = await entries[0];
    assert.equal(response.failed, undefined, 'Original CSS response was unavailable');
    assert.equal(response.status, 200, 'Original CSS response must succeed');
    assert.match(response.contentType || '', /^text\/css(?:;\s*charset=utf-8)?$/iu);
    assert.equal(response.redirected, false, 'Redirected CSS is not the original resource');
    assert.ok(Buffer.isBuffer(response.body) && response.body.length > 0 && response.body.length <= 524_288);
    const original = git('show', productSha + ':' + sourcePath);
    assert.ok(original.equals(response.body), 'Loaded CSS bytes differ from the exact product source');
    styles.push({ sourcePath, url, body: response.body, sha256: hash(response.body),
      gitBlob: blob(response.body), bytes: response.body.length });
  }
  return styles;
}

export async function captureGuestPrintSource(popup, testInfo, name, { expectedText, excludedText }) {
  if (process.env.CM_GUEST_CAPTURE !== '1') return;
  assert.match(name, /^guest-multipage-(?:de|en)$/u, 'Only the original multipage cases may be captured');
  const language = name.slice(-2);
  const project = testInfo.project.name;
  assert.ok(GUEST_CAPTURE_PROJECTS.includes(project), 'Unknown original capture project');
  const binding = validateGuestSourceBinding(process.env.CM_GUEST_PRODUCT_SOURCE_SHA, process.env.CM_GUEST_CAPTURE_SOURCE_SHA);
  const browser = popup.context().browser();
  const browserName = browser.browserType().name();
  assert.equal(browserName, project === 'chromium-desktop' ? 'chromium' : 'webkit');
  const snapshot = await popup.evaluate(() => {
    const documentRoot = document.documentElement;
    const tags = new Set(['html', 'head', 'meta', 'title', 'link', 'body', 'button', 'header',
      'small', 'h1', 'h2', 'p', 'main', 'section', 'article', 'dl', 'dt', 'dd', 'div', 'a']);
    const attributes = { html: ['lang'], meta: ['charset', 'name', 'http-equiv', 'content'],
      link: ['rel', 'href'], button: ['type', 'disabled'], a: ['href', 'target', 'rel'] };
    const safeStructure = [...document.querySelectorAll('*')].every((element) => tags.has(element.localName)
      && [...element.attributes].every((attribute) => attribute.name === 'class'
        || (attributes[element.localName] || []).includes(attribute.name)))
      && document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').length === 1
      && document.querySelectorAll('meta').length === 4
      && document.querySelector('meta[charset]')?.getAttribute('charset') === 'utf-8'
      && document.querySelector('meta[name="viewport"]')?.content === 'width=device-width, initial-scale=1'
      && document.querySelector('meta[name="referrer"]')?.content === 'no-referrer'
      && document.querySelectorAll('link').length === 2
      && document.querySelectorAll('button').length === 1
      && document.querySelector('button')?.matches('button.print-action[type="button"]')
      && document.body.className === 'guest-print-document'
      && [...document.querySelectorAll('a')].every((link) => link.href === 'https://www.openstreetmap.org/'
        && link.target === '_blank' && link.rel === 'noopener noreferrer');
    const styles = [...document.querySelectorAll('link[rel="stylesheet"]')];
    return { url: location.href, language: documentRoot.lang, title: document.title,
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,
      styles: styles.map((link) => link.getAttribute('href')),
      ready: document.readyState === 'complete' && document.styleSheets.length === 2
        && styles.every((link) => link.sheet?.cssRules.length > 0) && !document.querySelector('button.print-action')?.disabled,
      safeStructure: Boolean(safeStructure), openerDetached: window.opener === null,
      html: (document.doctype ? new XMLSerializer().serializeToString(document.doctype) : '')
        + '\n' + documentRoot.outerHTML,
      text: document.body.textContent,
    };
  });
  validateGuestCaptureSnapshot(snapshot, language, expectedText, excludedText);
  const styles = await verifyGuestCaptureStyles(observations.get(popup.context())?.get(popup), binding.productSourceSha);
  const parent = path.join(ROOT, 'test-results');
  await mkdir(parent, { recursive: true });
  assert.equal((await lstat(parent)).isSymbolicLink(), false);
  const captures = path.join(parent, 'guest-print-capture');
  await mkdir(captures, { recursive: true, mode: 0o700 });
  assert.equal((await lstat(captures)).isSymbolicLink(), false);
  const output = path.join(captures, project + '-' + language);
  await mkdir(output, { mode: 0o700 });
  const html = Buffer.from(snapshot.html);
  const manifest = { schemaVersion: 1, scope: 'actual-guest-dom-capture', productAcceptance: false,
    ...binding, project, browserName, browserVersion: browser.version(), language,
    playwrightVersion: JSON.parse(await readFile(path.join(ROOT, 'node_modules/@playwright/test/package.json'), 'utf8')).version,
    testTitle: testInfo.title, document: { file: 'document.html', url: snapshot.url,
      sha256: hash(html), bytes: html.length, title: snapshot.title, csp: snapshot.csp },
    styles: styles.map(({ body: _body, ...style }) => ({ ...style, file: path.basename(style.sourcePath) })),
    expectedPublicFields: expectedText, privacyChecks: ['request-id', 'user-id', 'tenant-id', 'csrf-fixture',
      'private-request-requirements', 'private-dietary-requirements'],
  };
  await writeFile(path.join(output, 'document.html'), html, { flag: 'wx', mode: 0o600 });
  for (const style of styles) await writeFile(path.join(output, path.basename(style.sourcePath)), style.body, { flag: 'wx', mode: 0o600 });
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}

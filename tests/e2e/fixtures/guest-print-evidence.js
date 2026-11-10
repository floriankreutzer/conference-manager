import { attachCustomerScreenEvidence } from './customer-screen-evidence.js';
import assert from 'node:assert/strict';
import { expect, test } from '@playwright/test';
import { inspectChromiumGuestFrames } from './guest-print-pdf-geometry.js';
import { captureGuestPrintSource, observeGuestPrintResponses } from './guest-print-source-capture.js';

test.beforeEach(({ context }) => observeGuestPrintResponses(context));

// Chromium/Skia emits plain page dictionaries even when content/font streams are
// compressed. This is an assertion on that renderer's artifact, not a PDF parser
// for uploads. Independent PDF text/render review uses the attached original.
export function inspectChromiumA4Pdf(pdf, minimumPages = 1) {
  assert.ok(Buffer.isBuffer(pdf) && pdf.length > 1000 && pdf.length < 1_048_576, 'Expected a bounded PDF artifact');
  const source = pdf.toString('latin1');
  assert.ok(source.startsWith('%PDF-') && source.trimEnd().endsWith('%%EOF'), 'Expected a complete PDF artifact');
  const dictionaries = [...source.matchAll(/(?:^|\n)\d+ 0 obj\r?\n([\s\S]*?)\r?\nendobj/g)]
    .map((match) => match[1].split(/\r?\nstream\r?\n/, 1)[0]);
  const pages = dictionaries.filter((value) => /\/Type\s*\/Page\b/u.test(value));
  const counts = dictionaries.filter((value) => /\/Type\s*\/Pages\b/u.test(value))
    .map((value) => Number(value.match(/\/Count\s+(\d+)/u)?.[1]));
  assert.ok(pages.length >= minimumPages && pages.length <= 4, 'Unexpected PDF page count');
  assert.equal(Math.max(...counts), pages.length, 'PDF page tree must match actual page dictionaries');
  const mediaBoxes = pages.map((value) => {
    const match = value.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/u);
    assert.ok(match, 'Each printed page must expose its physical dimensions');
    const width = Number(match[1]); const height = Number(match[2]);
    assert.ok(Math.abs(width - 210 * 72 / 25.4) < 2 && Math.abs(height - 297 * 72 / 25.4) < 2,
      'Each printed page must be portrait A4');
    assert.match(value, /\/Contents\s+(?:\d+ 0 R|\[)/u, 'Each page must reference rendered content');
    return { width, height };
  });
  return { pageCount: pages.length, mediaBoxes };
}

export async function attachGuestPrintEvidence(popup, testInfo, name, {
  minimumPages = 1, expectedText = [], excludedText = [],
} = {}) {
  const viewport = popup.viewportSize();
  await attachCustomerScreenEvidence(popup, testInfo, { screen: '13', state: 'detached-print-screen',
    roles: ['employee'], name, surface: false });
  await testInfo.attach(`${name}-screen`, { body: await popup.screenshot({ fullPage: true }), contentType: 'image/png' });
  try {
    await popup.emulateMedia({ media: 'print' });
    await expect(popup.locator('.print-action')).toBeHidden();
    for (const selector of ['.guest-print-facts', '.guest-print-grid']) {
      await expect(popup.locator(selector)).toHaveCSS('display', 'grid');
      // The phone's screen-only single-column rule must not leak into print.
      expect(await popup.locator(selector).evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
    }
    // A4's printable area at 96 CSS px/in, after the existing 12 mm margins.
    const printableA4Height = 273 * 96 / 25.4;
    const printableViewport = { width: Math.round(186 * 96 / 25.4), height: Math.round(printableA4Height) };
    await popup.setViewportSize(printableViewport);
    // Keeping a group together is possible only when the whole group fits a
    // page. Include its margins and the containing content's block padding;
    // real paginated PDF checks remain separate from this geometry precondition.
    const printGroups = await popup.locator('.guest-print-facts, .guest-print-grid').evaluateAll((groups) => (
      groups.map((group) => {
        const style = getComputedStyle(group);
        const contentStyle = getComputedStyle(group.parentElement);
        return { height: group.getBoundingClientRect().height, outerSpace: [
          style.marginBlockStart, style.marginBlockEnd, contentStyle.paddingBlockStart, contentStyle.paddingBlockEnd,
        ].map((value) => Number.parseFloat(value)) };
      })
    ));
    expect(printGroups).toHaveLength(2);
    for (const group of printGroups) {
      expect([group.height, ...group.outerSpace].every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
      expect(group.height).toBeGreaterThan(0);
      expect(group.height + group.outerSpace.reduce((sum, value) => sum + value, 0),
        'Each complete Guest print group, including block spacing, must fit one A4 page').toBeLessThanOrEqual(printableA4Height);
    }
    expect(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await popup.locator('.guest-print-card').evaluateAll((cards) => cards.every((card) => (
      card.scrollWidth <= card.clientWidth + 1 && card.scrollHeight <= card.clientHeight + 1
    )))).toBe(true);
    const text = await popup.locator('body').innerText();
    expect(text).not.toContain(await popup.locator('.print-action').textContent());
    const normalized = text.replace(/\s+/gu, ' ');
    for (const value of expectedText) expect(normalized).toContain(value.replace(/\s+/gu, ' '));
    for (const value of excludedText) expect(normalized).not.toContain(value);
    await testInfo.attach(`${name}-print-text`, { body: Buffer.from(text), contentType: 'text/plain' });
    await testInfo.attach(`${name}-print-css`, { body: await popup.screenshot({ fullPage: true }), contentType: 'image/png' });
    if (testInfo.project.name === 'chromium-desktop') {
      const pdf = await popup.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
      // Retain the original even when the following structural assertion fails.
      await testInfo.attach(`${name}-pdf`, { body: pdf, contentType: 'application/pdf' });
      const structure = inspectChromiumA4Pdf(pdf, minimumPages);
      const frameCount = await popup.locator('.guest-print-card:not(.guest-print-wifi)').count();
      structure.cardFrames = inspectChromiumGuestFrames(pdf, frameCount);
      await testInfo.attach(`${name}-pdf-structure`, { body: Buffer.from(JSON.stringify(structure, null, 2)),
        contentType: 'application/json' });
    }
  } finally {
    await popup.emulateMedia({ media: 'screen' });
    if (viewport) await popup.setViewportSize(viewport);
  }
  await captureGuestPrintSource(popup, testInfo, name, { expectedText, excludedText });
}

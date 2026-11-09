import { expect } from '@playwright/test';

export async function requestSummaryViewportEvidence(cards) {
  return cards.evaluateAll((nodes) => {
    const box = (node) => {
      const { top, right, bottom, left, width, height } = node.getBoundingClientRect();
      return { top, right, bottom, left, width, height };
    };
    const inViewport = (rect) => rect.width > 0 && rect.height > 0
      && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollY,
      summaries: nodes.map((node) => {
        const summary = node.querySelector('.request-card-summary');
        const facts = [...summary.querySelectorAll('[data-request-fact]')];
        const parts = [...summary.querySelectorAll('h3, dt, dd')];
        const bounds = box(summary);
        return { id: node.dataset.productionRequestId, bounds,
          facts: facts.map((fact) => fact.dataset.requestFact),
          complete: inViewport(bounds) && parts.every((part) => inViewport(box(part))
            && part.textContent.trim() && getComputedStyle(part).visibility === 'visible'),
        };
      }),
    };
  });
}

export async function expectRequestCardReflow(card) {
  const layout = await card.evaluate((node) => {
    const content = [...node.querySelectorAll('.request-card-summary h3, .request-summary-facts dt, .request-summary-facts dd, .request-critical-note')];
    return { viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth,
      fields: content.map((field) => {
        const bounds = field.getBoundingClientRect();
        const text = document.createRange();
        text.selectNodeContents(field);
        const textBounds = text.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height, left: bounds.left, right: bounds.right,
          textLeft: textBounds.left, textRight: textBounds.right, textTop: textBounds.top, textBottom: textBounds.bottom,
          top: bounds.top, bottom: bounds.bottom, visibility: getComputedStyle(field).visibility };
      }) };
  });
  expect(layout.documentWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.fields.length).toBeGreaterThanOrEqual(11);
  for (const field of layout.fields) {
    expect(field.visibility).toBe('visible');
    expect(field.width).toBeGreaterThan(0);
    expect(field.height).toBeGreaterThan(0);
    expect(field.left).toBeGreaterThanOrEqual(0);
    expect(field.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(field.textLeft).toBeGreaterThanOrEqual(field.left - 1);
    expect(field.textRight).toBeLessThanOrEqual(field.right + 1);
    expect(field.textTop).toBeGreaterThanOrEqual(field.top - 1);
    expect(field.textBottom).toBeLessThanOrEqual(field.bottom + 1);
  }
  return layout;
}

export async function readSubmissionNoticeLayout(notice) {
  return notice.evaluate((node) => {
    const box = (element) => {
      const { top, right, bottom, left, width, height } = element.getBoundingClientRect();
      return { top, right, bottom, left, width, height };
    };
    return { viewportWidth: innerWidth, viewportHeight: innerHeight,
      scrollX, scrollY, documentWidth: document.documentElement.scrollWidth,
      bounds: box(node),
      fields: [...node.querySelectorAll('strong, p, button')].map((field) => {
        const range = document.createRange();
        range.selectNodeContents(field);
        const { top, right, bottom, left } = range.getBoundingClientRect();
        return { bounds: box(field), text: { top, right, bottom, left },
          visibility: getComputedStyle(field).visibility };
      }),
    };
  });
}

export async function expectSubmissionNoticeReflow(notice, title) {
  await expect(notice).toHaveAttribute('role', 'status');
  await expect(notice.locator(':scope > div > p').first()).toHaveText(title);
  const layout = await readSubmissionNoticeLayout(notice);
  expect(layout.documentWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.bounds.left).toBeGreaterThanOrEqual(0);
  expect(layout.bounds.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.fields).toHaveLength(4);
  for (const { bounds, text, visibility } of layout.fields) {
    expect(visibility).toBe('visible');
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
    expect(bounds.left).toBeGreaterThanOrEqual(layout.bounds.left - 1);
    expect(bounds.right).toBeLessThanOrEqual(layout.bounds.right + 1);
    expect(text.left).toBeGreaterThanOrEqual(bounds.left - 1);
    expect(text.right).toBeLessThanOrEqual(bounds.right + 1);
    expect(text.top).toBeGreaterThanOrEqual(bounds.top - 1);
    expect(text.bottom).toBeLessThanOrEqual(bounds.bottom + 1);
  }
  return layout;
}

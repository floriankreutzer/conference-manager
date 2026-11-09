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

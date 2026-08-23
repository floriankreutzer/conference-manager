import { expect, test } from '@playwright/test';

const futureIsoDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
};

test('demo mode is explicit, input bounds apply and local demo data can be cleared', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-demo-security-build', '2026.08.23.52');
  await expect(page.locator('html')).toHaveAttribute('data-runtime-mode', 'demo');
  await expect(page.locator('meta[name="conference-runtime"]')).toHaveAttribute('content', 'demo');

  const notice = page.locator('[data-demo-security]');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(/Kein SSO|No SSO/);
  await expect(notice).toContainText(/Daten nur in diesem Browser|data only in this browser/);

  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  const title = page.locator('#title');
  await title.focus();
  await expect(title).toHaveAttribute('maxlength', '120');

  const participants = page.locator('#internalParticipants');
  await participants.fill('999');
  await expect(participants).toHaveValue('500');
  await expect(participants).toHaveAttribute('max', '500');

  await page.evaluate(() => localStorage.setItem('conference_security_test', 'sensitive-demo-value'));
  page.once('dialog', (dialog) => dialog.accept());
  await notice.locator('.demo-security-reset').click();
  await page.waitForLoadState('domcontentloaded');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('conference_security_test'))).toBeNull();
});

test('manipulated demo role values are normalized before application rendering', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('conference_demo_role_v1', 'administrator');
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('conference_demo_role_v1'))).toBe('employee');
  await expect(page.locator('#primaryNavigation button[data-view="manager"]')).toHaveCount(0);
});

test('stored user-controlled text is rendered as text across an XSS fuzz corpus', async ({ page }) => {
  const date = futureIsoDate();
  const payloads = [
    '<img src=x onerror="window.__conferenceXss=1">Security test',
    '<svg onload="window.__conferenceXss=2">svg</svg>',
    '<script>window.__conferenceXss=3</script>',
    '\"><iframe srcdoc="<script>parent.__conferenceXss=4</script>"></iframe>',
    '<a href="javascript:window.__conferenceXss=5">click</a>',
  ];
  await page.addInitScript(({ seededDate, fuzzPayloads }) => {
    const now = new Date().toISOString();
    localStorage.setItem('conference_requests', JSON.stringify(fuzzPayloads.map((title, index) => ({
      id: `CR-SEC-${String(index + 1).padStart(3, '0')}`,
      title,
      location: 'Berlin',
      date: seededDate,
      start: `${10 + index}:00`,
      end: `${11 + index}:00`,
      roomId: 'BER-321',
      status: 'Submitted',
      calendarStatus: 'Tentative',
      participants: 2,
      internalParticipants: 2,
      externalParticipants: 0,
      serviceIds: [],
      quantities: {},
      allocations: [{ costCenter: 'CC-SEC', percent: 100 }],
      estimatedCost: 0,
      createdAt: now,
      updatedAt: now,
      statusHistory: [],
    }))));
  }, { seededDate: date, fuzzPayloads: payloads });

  await page.goto('/');
  await page.locator('#primaryNavigation button[data-view="requests"]').click();
  await expect(page.locator('.request-card')).toHaveCount(payloads.length);
  for (const payload of payloads) {
    await expect(page.locator('.request-card').filter({ hasText: payload })).toHaveCount(1);
  }
  await expect(page.locator('.request-card').locator('script, iframe, svg, img, a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__conferenceXss)).toBeUndefined();
});

test('URL and DOM attribute guards reject executable schemes and unsafe attributes', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const ui = await import('/src/core/ui.js?security-regression=52');
    const hostileUrls = [
      'javascript:alert(1)',
      'java\nscript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'vbscript:msgbox(1)',
      'ftp://example.test/file',
      'http://example.test/not-same-origin',
      '//example.test/protocol-relative',
    ];
    const rejected = hostileUrls.map((value) => ({
      value,
      navigation: ui.safeNavigationUrl(value),
      https: ui.safeHttpsUrl(value),
    }));

    const anchor = ui.el('a', {
      text: 'unsafe',
      attrs: {
        href: 'javascript:window.__conferenceAttrXss=1',
        onclick: 'window.__conferenceAttrXss=2',
        onmouseover: 'window.__conferenceAttrXss=3',
        srcdoc: '<script>window.__conferenceAttrXss=4</script>',
        style: 'background-image:url(javascript:window.__conferenceAttrXss=5)',
        target: '_blank',
        rel: 'opener',
        'data-safe': 'kept',
      },
    });

    const hostileImage = ui.el('img', {
      attrs: {
        src: 'data:text/html,<script>window.__conferenceAttrXss=6</script>',
        onerror: 'window.__conferenceAttrXss=7',
      },
    });

    const inlineFloorplan = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2010%2010%22%3E%3Crect%20width%3D%2210%22%20height%3D%2210%22%2F%3E%3C%2Fsvg%3E';
    const floorplanImage = ui.el('img', { attrs: { src: inlineFloorplan } });
    const unsafeFrame = ui.el('iframe', { attrs: { src: inlineFloorplan } });
    const safe = ui.el('a', { href: '/safe-path', target: '_blank', rel: 'opener' });

    return {
      rejected,
      hostileAnchor: {
        href: anchor.getAttribute('href'),
        onclick: anchor.getAttribute('onclick'),
        onmouseover: anchor.getAttribute('onmouseover'),
        srcdoc: anchor.getAttribute('srcdoc'),
        style: anchor.getAttribute('style'),
        rel: anchor.getAttribute('rel'),
        safeData: anchor.getAttribute('data-safe'),
      },
      hostileImage: {
        src: hostileImage.getAttribute('src'),
        onerror: hostileImage.getAttribute('onerror'),
      },
      floorplanImageSrc: floorplanImage.getAttribute('src'),
      unsafeFrameSrc: unsafeFrame.getAttribute('src'),
      safeHref: safe.href,
      safeRel: safe.rel,
      origin: window.location.origin,
      marker: window.__conferenceAttrXss,
    };
  });

  for (const entry of result.rejected) {
    expect(entry.navigation, entry.value).toBeNull();
    expect(entry.https, entry.value).toBeNull();
  }
  expect(result.hostileAnchor.href).toBeNull();
  expect(result.hostileAnchor.onclick).toBeNull();
  expect(result.hostileAnchor.onmouseover).toBeNull();
  expect(result.hostileAnchor.srcdoc).toBeNull();
  expect(result.hostileAnchor.style).toBeNull();
  expect(result.hostileAnchor.safeData).toBe('kept');
  expect(result.hostileAnchor.rel).toContain('noopener');
  expect(result.hostileAnchor.rel).toContain('noreferrer');
  expect(result.hostileAnchor.rel.split(/\s+/)).not.toContain('opener');
  expect(result.hostileImage.src).toBeNull();
  expect(result.hostileImage.onerror).toBeNull();
  expect(result.floorplanImageSrc).toMatch(/^data:image\/svg\+xml;charset=UTF-8,/);
  expect(result.unsafeFrameSrc).toBeNull();
  expect(result.safeHref).toBe(`${result.origin}/safe-path`);
  expect(result.safeRel).toContain('noopener');
  expect(result.safeRel).toContain('noreferrer');
  expect(result.safeRel.split(/\s+/)).not.toContain('opener');
  expect(result.marker).toBeUndefined();
});

test('CSP blocks unsafe script and style primitives while retaining required demo sources', async ({ page }) => {
  await page.goto('/');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("style-src 'self'");
  expect(csp).toContain("style-src-attr 'none'");
  expect(csp).not.toMatch(/style-src[^;]*'unsafe-inline'/);
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-(?:inline|eval)'/);
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("worker-src 'none'");
});

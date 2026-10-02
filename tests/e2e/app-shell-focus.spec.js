import { expect, test } from '@playwright/test';

// Exercise the real shell and browser focus behavior without API timing noise.
// Hold only the application's animation callbacks so every interleaving is deterministic.
test.beforeEach(async ({ page }) => {
  await page.route('**/__focus-harness', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="en"><head><title>Shell focus test</title></head>
      <body><a id="skipLink" href="#mainContent">Skip</a>
      <aside id="sidebar"><span id="brandSubtitle"></span>
      <nav id="primaryNavigation"></nav><p id="sidebarFooter"></p></aside>
      <main id="mainContent"><h1 id="viewTitle" tabindex="-1">Test view</h1>
      <p id="viewSubtitle"></p><div id="app"></div></main></body></html>`,
  }));
  await page.goto('/__focus-harness');
  await page.evaluate(async () => {
    const { createAppShell } = await import('/src/platform/app-shell.js');
    const callbacks = [];
    window.requestAnimationFrame = (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    };
    const renderEditor = () => {
      const label = document.createElement('label');
      label.htmlFor = 'focusTestTitle';
      label.textContent = 'Title';
      const input = document.createElement('input');
      input.id = 'focusTestTitle';
      document.getElementById('app').append(label, input);
    };
    const shell = createAppShell({
      context: {
        tenantStatus: () => 'active',
        isAuthenticated: () => true,
        isManager: () => false,
        canManageTenantUsers: () => false,
        isDemoRuntime: () => false,
        initials: () => 'TU',
        fullName: () => 'Test User',
      },
      employee: { renderRequest: renderEditor, renderRequests: renderEditor },
      manager: null,
    });
    window.shellFocusTest = {
      shell,
      flushNext: () => {
        const callback = callbacks.shift();
        if (!callback) throw new Error('EXPECTED_NAVIGATION_FOCUS_CALLBACK');
        callback(performance.now());
      },
    };
  });
});

test('navigation announces the heading when no newer focus owner exists', async ({ page }) => {
  await page.evaluate(() => {
    window.shellFocusTest.shell.setView('employee');
    window.shellFocusTest.flushNext();
  });
  await expect(page.locator('#viewTitle')).toBeFocused();
});

test('delayed navigation focus cannot steal an Employee title input', async ({ page }) => {
  await page.evaluate(() => window.shellFocusTest.shell.setView('employee'));
  await page.getByLabel('Title', { exact: true }).focus();
  await page.evaluate(() => window.shellFocusTest.flushNext());
  await expect(page.getByLabel('Title', { exact: true })).toBeFocused();
  await page.keyboard.type('Customer workshop');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Customer workshop');
});

test('delayed navigation focus respects a newly opened dialog', async ({ page }) => {
  await page.evaluate(() => {
    window.shellFocusTest.shell.setView('employee');
    const dialog = document.createElement('dialog');
    const close = document.createElement('button');
    close.textContent = 'Close focus dialog';
    dialog.append(close);
    document.body.append(dialog);
    dialog.showModal();
    close.focus();
    window.shellFocusTest.flushNext();
  });
  await expect(page.getByRole('button', { name: 'Close focus dialog' })).toBeFocused();
});

test('a render invalidation cancels its pending navigation focus', async ({ page }) => {
  await page.evaluate(() => {
    window.shellFocusTest.shell.setView('employee');
    window.shellFocusTest.shell.invalidatePendingRender();
    window.shellFocusTest.flushNext();
  });
  await expect(page.locator('#viewTitle')).not.toBeFocused();
});

test('a session lock blocks an already queued navigation focus', async ({ page }) => {
  await page.evaluate(() => {
    window.shellFocusTest.shell.setView('employee');
    document.documentElement.dataset.sessionLocked = 'true';
    window.shellFocusTest.flushNext();
  });
  await expect(page.locator('#viewTitle')).not.toBeFocused();
});

test('only the latest navigation may move focus to the heading', async ({ page }) => {
  await page.evaluate(() => {
    window.shellFocusTest.shell.setView('employee');
    window.shellFocusTest.shell.setView('requests');
    window.shellFocusTest.flushNext();
  });
  await expect(page.locator('#viewTitle')).not.toBeFocused();
  await page.evaluate(() => window.shellFocusTest.flushNext());
  await expect(page.locator('#viewTitle')).toBeFocused();
});

import { expect, test } from '@playwright/test';

const CURRENT_USER_ID = 'user-current';
const TARGET_USER_ID = 'user-target';

async function mountUsers(page) {
  await page.goto('/');
  await page.evaluate(async ({ currentUserId, targetUserId }) => {
    document.getElementById('tenant-user-focus-fixture')?.remove();
    const root = document.createElement('main');
    root.id = 'tenant-user-focus-fixture';
    document.body.appendChild(root);

    let users = [
      {
        id: currentUserId,
        displayName: 'Current Admin',
        active: true,
        roles: ['employee', 'tenant_admin'],
        lifecycle: { status: 'active', version: 1 },
        identityProvider: { linked: true, linkedAt: '2026-08-20T08:00:00.000Z' },
        lastSignInAt: '2026-08-27T07:45:00.000Z',
        requestOwnership: { openRequestCount: 0, ownershipPreservedOnDisable: true },
      },
      {
        id: targetUserId,
        displayName: 'Filtered User',
        active: true,
        roles: ['employee'],
        lifecycle: { status: 'active', version: 3 },
        identityProvider: { linked: false, linkedAt: null },
        lastSignInAt: null,
        requestOwnership: { openRequestCount: 2, ownershipPreservedOnDisable: true },
      },
    ];
    const copy = (value) => structuredClone(value);
    const adapter = Object.freeze({
      async listUsers({ search, status, role, providerLink }) {
        const normalizedSearch = String(search || '').toLocaleLowerCase('en');
        const visible = users.filter((user) => {
          if (normalizedSearch && !user.displayName.toLocaleLowerCase('en').includes(normalizedSearch)) return false;
          if (status !== 'all' && (user.active ? 'active' : 'disabled') !== status) return false;
          if (role === 'employee_only' && user.roles.some((entry) => entry !== 'employee')) return false;
          if (role !== 'all' && role !== 'employee_only' && !user.roles.includes(role)) return false;
          if (providerLink !== 'all' && (user.identityProvider.linked ? 'linked' : 'unlinked') !== providerLink) return false;
          return true;
        });
        return { users: copy(visible), nextAfterId: null };
      },
      async setRoles(userId, roles) {
        users = users.map((user) => user.id === userId ? { ...user, roles: ['employee', ...roles] } : user);
        return copy(users.find((user) => user.id === userId));
      },
      async setAccess(userId, active, expectedVersion) {
        users = users.map((user) => user.id === userId
          ? {
            ...user,
            active,
            lifecycle: {
              status: active ? 'active' : 'disabled',
              version: expectedVersion + 1,
            },
          }
          : user);
        return copy(users.find((user) => user.id === userId));
      },
    });
    const { createUsersSection } = await import('/src/tenant-admin/sections/users/index.js');
    const section = createUsersSection({
      context: { userId: () => currentUserId, isDemoRuntime: () => true },
      adapter,
    });
    let generation = 0;
    const render = () => {
      generation += 1;
      const currentGeneration = generation;
      return section.render({
        root,
        isCurrent: () => generation === currentGeneration,
        rerender: render,
      });
    };
    await render();
  }, { currentUserId: CURRENT_USER_ID, targetUserId: TARGET_USER_ID });
}

async function applyFilter(root, selector, value) {
  await root.locator(selector).selectOption(value);
  await root.locator('[data-tenant-user-filters="true"] button[type="submit"]').click();
}

test('lifecycle mutation falls back to the result status when the active filter removes the User', async ({ page }) => {
  await mountUsers(page);
  const root = page.locator('#tenant-user-focus-fixture');
  await applyFilter(root, '#tenant-user-status-filter', 'active');

  const target = root.locator(`[data-tenant-user-id="${TARGET_USER_ID}"]`);
  await target.locator('[data-tenant-user-lifecycle-action="disable"]').click();

  await expect(root.locator(`[data-tenant-user-id="${TARGET_USER_ID}"]`)).toHaveCount(0);
  await expect(root.locator('.tenant-operations-result-status')).toBeFocused();
});

test('role mutation falls back to the result status when the role filter removes the User', async ({ page }) => {
  await mountUsers(page);
  const root = page.locator('#tenant-user-focus-fixture');
  await applyFilter(root, '#tenant-user-role-filter', 'employee_only');

  const target = root.locator(`[data-tenant-user-id="${TARGET_USER_ID}"]`);
  await target.locator(`#tenant-user-manager-${TARGET_USER_ID}`).check();
  await target.locator('[data-tenant-role-action="save"]').click();

  await expect(root.locator(`[data-tenant-user-id="${TARGET_USER_ID}"]`)).toHaveCount(0);
  await expect(root.locator('.tenant-operations-result-status')).toBeFocused();
});

import { test as setup, expect } from '@playwright/test';
import { MANAGER } from './helpers';
import { MANAGER_STATE } from './admin-helpers';

/**
 * Signs the seeded MANAGER in once through the real login form and saves the session. Admin specs reuse this
 * file so the login rate limit (5 attempts / 15 min per phone) is not exhausted.
 */
setup('sign in manager', async ({ page }) => {
  await page.goto('/login?next=/admin');
  await page.getByLabel(/رقم الهاتف|Phone number/).fill(MANAGER.phone);
  await page.getByLabel(/كلمة المرور|Password/).fill(MANAGER.password);
  const loginResponse = page.waitForResponse((r) => r.url().includes('/api/v1/auth/login'));
  await page.getByRole('button', { name: /^(دخول|Sign in)$/ }).click();
  const res = await loginResponse;
  expect(res.status()).toBe(200);
  await page.waitForURL((u) => u.pathname === '/admin', { timeout: 30000 });
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === 'b2b_session')).toBe(true);
  await page.context().storageState({ path: MANAGER_STATE });
});

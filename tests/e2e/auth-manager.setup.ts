import { test as setup, expect } from '@playwright/test';
import { MANAGER } from './helpers';
import { MANAGER_STATE } from './admin-helpers';

/**
 * Signs the seeded MANAGER in once through the real login form and saves the session. Admin specs reuse this
 * file so the login rate limit (5 attempts / 15 min per phone) is not exhausted.
 */
setup('sign in manager', async ({ page }) => {
  await page.goto('/login?portal=admin&next=/admin');
  const panel = page.locator('#admin-login');
  await panel.getByLabel(/رقم هاتف|رقم الهاتف|phone number/i).fill(MANAGER.phone);
  await panel.getByLabel(/كلمة المرور|Password/).fill(MANAGER.password);
  const loginResponse = page.waitForResponse((r) => r.url().includes('/api/v1/auth/login'));
  await panel.locator('button[type="submit"]').click();
  const res = await loginResponse;
  expect(res.status()).toBe(200);
  await page.waitForURL((u) => u.pathname === '/admin', { timeout: 30000 });
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === 'b2b_session')).toBe(true);
  await page.context().storageState({ path: MANAGER_STATE });
});

import { test as setup, expect } from '@playwright/test';
import { CUSTOMER_A } from './helpers';

export const CUSTOMER_STATE = 'tests/e2e/.auth/customer.json';

/** Signs the approved customer in once through the real login form; later tests reuse the session. */
setup('sign in approved customer', async ({ page }) => {
  await page.goto('/login?next=/account');
  const panel = page.locator('#customer-login');
  await panel.getByLabel(/رقم الهاتف|Phone number/).fill(CUSTOMER_A.phone);
  await panel.getByLabel(/كلمة المرور|Password/).fill(CUSTOMER_A.password);
  const loginResponse = page.waitForResponse((r) => r.url().includes('/api/v1/auth/login'));
  await panel.locator('button[type="submit"]').click();
  const res = await loginResponse;
  console.log('LOGIN_STATUS', res.status(), 'URL_BEFORE_WAIT', page.url());
  await page.waitForURL((u) => u.pathname === '/account', { timeout: 30000 });
  const cookies = await page.context().cookies();
  console.log('COOKIES', cookies.map((c) => `${c.name}@${c.domain}`).join(','));
  expect(cookies.some((c) => c.name === 'b2b_session')).toBe(true);
  await page.context().storageState({ path: CUSTOMER_STATE });
});

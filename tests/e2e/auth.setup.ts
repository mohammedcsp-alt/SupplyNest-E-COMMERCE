import { test as setup, expect } from '@playwright/test';
import { CUSTOMER_A } from './helpers';

export const CUSTOMER_STATE = 'tests/e2e/.auth/customer.json';

/** Signs the approved customer in once through the real login form; later tests reuse the session. */
setup('sign in approved customer', async ({ page }) => {
  await page.goto('/login?next=/account');
  await page.getByLabel(/رقم الهاتف|Phone number/).fill(CUSTOMER_A.phone);
  await page.getByLabel(/كلمة المرور|Password/).fill(CUSTOMER_A.password);
  await page.getByRole('button', { name: /^(دخول|Sign in)$/ }).click();
  await page.waitForURL('**/account', { timeout: 30000 });
  await expect(page.getByRole('navigation').first()).toBeVisible();
  await page.context().storageState({ path: CUSTOMER_STATE });
});

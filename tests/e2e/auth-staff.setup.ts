import { test as setup, expect } from '@playwright/test';
import { devPassword } from '../../prisma/seed/dev-secret';

/**
 * Signs the seeded fulfillment and accounting staff in ONCE each through the real login form and saves the sessions.
 * The fulfillment and accounting E2E spec reuses these files, so no account logs in more than once per run
 * (the per-account login limit is 5 attempts per 15 minutes). Phones are the seeded staff accounts.
 */
const STAFF = [
  { role: 'picker', phone: '+9647700000006', next: '/fulfillment' },
  { role: 'checker', phone: '+9647700000008', next: '/fulfillment' },
  { role: 'packer', phone: '+9647700000009', next: '/fulfillment' },
  { role: 'accountant', phone: '+9647700000010', next: '/accounting' },
] as const;

for (const acc of STAFF) {
  setup(`sign in ${acc.role}`, async ({ page }) => {
    await page.goto(`/login?portal=admin&next=${encodeURIComponent(acc.next)}`);
    const panel = page.locator('#admin-login');
    await panel.getByLabel(/رقم هاتف|رقم الهاتف|phone number/i).fill(acc.phone);
    await panel.getByLabel(/كلمة المرور|Password/).fill(devPassword());
    const loginResponse = page.waitForResponse((r) => r.url().includes('/api/v1/auth/login'));
    await panel.locator('button[type="submit"]').click();
    const res = await loginResponse;
    expect(res.status()).toBe(200);
    await page.waitForURL((u) => u.pathname === acc.next, { timeout: 30000 });
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === 'b2b_session')).toBe(true);
    await page.context().storageState({ path: `tests/e2e/.auth/${acc.role}.json` });
  });
}

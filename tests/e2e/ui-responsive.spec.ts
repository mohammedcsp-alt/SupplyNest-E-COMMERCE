import { test, expect } from '@playwright/test';
import { setLang, langOf } from './helpers';

/**
 * Responsive and direction checks (UX-007, UX-010). The desktop project runs in Arabic (RTL) and the mobile project in
 * English (LTR), the same convention as ui-layout.spec.ts. Each route must not scroll sideways at its viewport.
 */
const ROUTES = ['/', '/catalog', '/login', '/register', '/cart', '/products/DEV-TS-S-WH', '/search', '/p/about'];

test.describe('responsive layout and direction', () => {
  for (const route of ROUTES) {
    test(`${route}: no horizontal overflow and the document direction matches the language`, async ({ page }, info) => {
      const lang = langOf(info.project.name);
      await setLang(page, lang);
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} must not scroll sideways at ${info.project.name}`).toBeLessThanOrEqual(1);
    });
  }
});

import { test, expect } from '@playwright/test';
import { setLang, langOf } from './helpers';

/**
 * Layout checks. The desktop project runs in Arabic (RTL) and the mobile project in English (LTR).
 * The language toggle switches direction at runtime. Acceptance: ACX-12, T038.
 */
test.describe('language direction and layout', () => {
  test('pages render with the right document direction and language', async ({ page }, info) => {
    const lang = langOf(info.project.name);
    await setLang(page, lang);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
  });

  test('the language toggle flips direction on the same page', async ({ page }, info) => {
    const lang = langOf(info.project.name);
    await setLang(page, lang);
    const target = lang === 'ar' ? 'en' : 'ar';
    await page.goto(`/api/v1/locale?set=${target}&next=/catalog`);
    await expect(page.locator('html')).toHaveAttribute('dir', target === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', target);
  });

  test('the catalog has no horizontal overflow at this viewport', async ({ page }, info) => {
    await setLang(page, langOf(info.project.name));
    await page.goto('/catalog');
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'page must not scroll sideways').toBeLessThanOrEqual(1);
  });

  test('the primary navigation is reachable', async ({ page }, info) => {
    const lang = langOf(info.project.name);
    await setLang(page, lang);
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: lang === 'ar' ? 'التنقل الرئيسي' : 'Main navigation' })).toBeVisible();
    await expect(page.getByRole('link', { name: lang === 'ar' ? 'الكتالوج' : 'Catalog' }).first()).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';
import { CUSTOMER_A, SKU_IN_STOCK, setLang, clearCartLine, langOf } from './helpers';
import { resetCheckoutLimit } from './rate-limit-reset';

/**
 * Customer journey in the browser: visitors do not see prices; an approved customer sees a price, adds an item,
 * reviews the quote, confirms and places a COD order (ORD-01, T001, T006, T024).
 */
test.describe('visitor', () => {
  // anonymous: ignore the shared customer session
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a visitor sees no price and is asked to sign in', async ({ page }, info) => {
    const lang = langOf(info.project.name);
    await setLang(page, lang);
    await page.goto(`/products/${SKU_IN_STOCK}`);
    const hint = lang === 'ar' ? 'سجّل الدخول للطلب' : 'Sign in to order';
    await expect(page.getByText(new RegExp(hint))).toBeVisible();
    await expect(page.getByText(/IQD|د\.ع/)).toHaveCount(0);
  });
});

test.describe('approved customer', () => {
  test('sees a price, adds an item to the cart and places a COD order', async ({ page }, info) => {
    test.setTimeout(120_000);
    const lang = langOf(info.project.name);
    await setLang(page, lang);

    await resetCheckoutLimit();
    await clearCartLine(page, SKU_IN_STOCK);
    await page.goto(`/products/${SKU_IN_STOCK}`);
    await expect(page.getByText(/IQD|د\.ع/).first()).toBeVisible();

    await page.getByRole('button', { name: lang === 'ar' ? 'أضف إلى السلة' : 'Add to cart' }).click();
    await expect(page.getByText(lang === 'ar' ? 'أُضيف إلى السلة' : 'Added to cart')).toBeVisible();

    await page.goto('/checkout');
    await page.locator('input[type=radio][name=address]').first().check();
    // the checkout lines are a table on desktop and stacked cards on phones; the SKU must be visible in either
    await expect(page.getByText(SKU_IN_STOCK).filter({ visible: true }).first()).toBeVisible({ timeout: 20000 });

    await page.getByRole('checkbox').first().check();
    await page.getByRole('button', { name: lang === 'ar' ? 'تأكيد الطلب' : 'Place order' }).click();
    await page.waitForURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 30000 });
    await expect(page.getByText(/ORD-\d{8}-\d{6}/).first()).toBeVisible();
  });
});

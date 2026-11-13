import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Seeded development accounts (test database). */
export const CUSTOMER_A = { phone: '+9647700001001', password: 'Dev-Only-Pass-2026!' };
export const MANAGER = { phone: '+9647700000001', password: 'Dev-Only-Pass-2026!' };
export const SKU_IN_STOCK = 'DEV-TS-S-WH'; // seeded T-shirt, 40 units, priced for every level

export type Lang = 'ar' | 'en';

const BASE = 'http://127.0.0.1:3210';

/** Sets the UI language cookie before navigation (the same cookie the language toggle sets). */
export async function setLang(page: Page, lang: Lang) {
  await page.context().addCookies([{ name: 'b2b_locale', value: lang, url: BASE }]);
}

export function langOf(project: string): Lang {
  return project.startsWith('desktop') ? 'ar' : 'en';
}

export async function uiLogin(page: Page, phone: string, password: string, lang: Lang, next = '/account') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  const phoneLabel = lang === 'ar' ? 'رقم الهاتف' : 'Phone number';
  const passLabel = lang === 'ar' ? 'كلمة المرور' : 'Password';
  await page.getByLabel(new RegExp(phoneLabel)).fill(phone);
  await page.getByLabel(new RegExp(passLabel)).fill(password);
  await page.getByRole('button', { name: lang === 'ar' ? 'دخول' : 'Sign in' }).click();
  await page.waitForURL((u) => u.pathname === next, { timeout: 20000 });
}

/** Removes a SKU from the logged-in customer's cart through the API so tests can be re-run. */
export async function clearCartLine(page: Page, sku: string) {
  const res = await page.request.put('/api/v1/cart/items', { data: { sku, qty: 0 } });
  expect([200, 401, 403]).toContain(res.status());
}

/**
 * Logged-in customer adds SKU_IN_STOCK, reviews the checkout quote and places a COD order in the browser.
 * Returns the order URL path (/orders/<uuid>).
 */
export async function placeOrderViaUi(page: Page, lang: Lang, qty = 1): Promise<string> {
  await clearCartLine(page, SKU_IN_STOCK);
  await page.goto(`/products/${SKU_IN_STOCK}`);
  if (qty > 1) {
    await page.getByLabel(lang === 'ar' ? 'الكمية' : 'Quantity').fill(String(qty));
  }
  await page.getByRole('button', { name: lang === 'ar' ? 'أضف إلى السلة' : 'Add to cart' }).click();
  await expect(page.getByText(lang === 'ar' ? 'أُضيف إلى السلة.' : 'Added to cart.')).toBeVisible();

  await page.goto('/checkout');
  await page.locator('input[type=radio][name=address]').first().check();
  await expect(page.getByRole('table').first()).toContainText(SKU_IN_STOCK, { timeout: 20000 });
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: lang === 'ar' ? 'تأكيد الطلب' : 'Place order' }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 30000 });
  return new URL(page.url()).pathname;
}

/** Separate API context logged in as the manager (approvals happen on the staff side). */
export async function managerApi(baseURL: string): Promise<APIRequestContext> {
  const { request } = await import('@playwright/test');
  const ctx = await request.newContext({ baseURL });
  const res = await ctx.post('/api/v1/auth/login', {
    data: { phone: MANAGER.phone, password: MANAGER.password },
    headers: { 'X-Forwarded-For': `10.201.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  });
  expect(res.status()).toBe(200);
  return ctx;
}

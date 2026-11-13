import { expect, request as pwRequest, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { placeOrderViaUi, setLang, type Lang } from './helpers';

/** Storage state of the MANAGER session, written once by tests/e2e/auth-manager.setup.ts. */
export const MANAGER_STATE = 'tests/e2e/.auth/manager.json';
/** Storage state of the approved customer, written by tests/e2e/auth.setup.ts. */
export const CUSTOMER_STATE = 'tests/e2e/.auth/customer.json';

export const BASE = 'http://127.0.0.1:3210';

/** API client that reuses the manager session saved by the setup project (no extra login attempts). */
export async function adminApi(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: BASE, storageState: MANAGER_STATE });
}

/** Unique upper-case code per run, e.g. QA-E2E-MKX3A9Z2. Only letters, digits and - so it is a valid SKU. */
export function uniq(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

/** A real 1x1 PNG (valid signature, decodable). */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** First active category from the admin taxonomy (used as the category for new SKUs and imports). */
export async function firstCategory(api: APIRequestContext): Promise<{ id: string; nameEn: string }> {
  const res = await api.get('/api/v1/admin/taxonomy');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { data: { categories: Array<{ id: string; nameEn: string; active: boolean }> } };
  const cat = body.data.categories.find((c) => c.active);
  expect(cat, 'the seed must contain an active category').toBeTruthy();
  return { id: cat!.id, nameEn: cat!.nameEn };
}

/** Looks a SKU up through the admin list API (exact code match). Returns undefined when absent. */
export async function findSkuByApi(api: APIRequestContext, code: string) {
  const res = await api.get(`/api/v1/admin/skus?q=${encodeURIComponent(code)}&pageSize=100`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { data: Array<{ id: string; sku: string; physicalOnHand: number; imageCount: number; prices?: Array<{ levelCode: string; amount: string }> }> };
  return body.data.find((s) => s.sku === code);
}

/** Dialog answers for ActionButton: confirm() is accepted, prompt() returns the given reason. */
export function answerDialogs(page: Page, promptText = 'E2E reason text') {
  page.on('dialog', (d) => (d.type() === 'prompt' ? d.accept(promptText) : d.accept()));
}

/**
 * Places a COD order as the approved customer in a separate browser context (the manager session stays in the
 * test page). Returns the order path and the order number shown on the order page.
 */
export async function customerPlacesOrder(
  browser: Browser,
  opts: { lang: Lang; locale: string; viewport?: { width: number; height: number } | null },
): Promise<{ orderPath: string; orderNumber: string; customer: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({
    storageState: CUSTOMER_STATE,
    baseURL: BASE,
    locale: opts.locale,
    viewport: opts.viewport ?? undefined,
  });
  const customer = await ctx.newPage();
  await setLang(customer, opts.lang);
  const orderPath = await placeOrderViaUi(customer, opts.lang);
  const text = await customer.getByText(/ORD-\d{8}-\d{6}/).first().innerText();
  const orderNumber = text.match(/ORD-\d{8}-\d{6}/)?.[0];
  expect(orderNumber, 'order number is shown on the order page').toBeTruthy();
  return { orderPath, orderNumber: orderNumber!, customer, close: () => ctx.close() };
}

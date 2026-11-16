import { test, expect } from '@playwright/test';
import { langOf, setLang } from './helpers';
import { MANAGER_STATE, customerPlacesOrder } from './admin-helpers';

test.use({ storageState: MANAGER_STATE });

/** Opens an order from the admin orders list by its number (the row's "Open" / "فتح" link). */
async function openOrderFromList(page: import('@playwright/test').Page, lang: 'ar' | 'en', orderNumber: string) {
  await page.goto(`/admin/orders?q=${orderNumber}`);
  const row = page.locator('tr', { hasText: orderNumber });
  await expect(row).toBeVisible();
  await row.getByRole('link', { name: lang === 'ar' ? 'فتح' : 'Open', exact: true }).click();
  await page.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}$/);
}

test.describe('admin orders', () => {
  test('a customer cancellation request shows the status and the approve / reject controls', async ({ page, browser }, info) => {
    test.setTimeout(180_000);
    const lang = langOf(info.project.name);
    const ar = lang === 'ar';
    await setLang(page, lang);

    const order = await customerPlacesOrder(browser, { lang, locale: info.project.use.locale ?? 'en-US', viewport: info.project.use.viewport });
    const reason = `E2E cancel reason ${Date.now().toString(36)}`;
    await order.customer.goto(order.orderPath);
    await order.customer.getByLabel(/Reason|السبب/).fill(reason);
    // wait for the server to accept the request before the customer context is closed
    const [cancelResponse] = await Promise.all([
      order.customer.waitForResponse((r) => r.url().includes('/cancel-request') && r.request().method() === 'POST', { timeout: 30000 }),
      order.customer.getByRole('button', { name: ar ? 'إرسال طلب الإلغاء' : 'Send cancellation request', exact: true }).click(),
    ]);
    expect(cancelResponse.status()).toBe(200);
    await order.close();

    await openOrderFromList(page, lang, order.orderNumber);
    await expect(page.getByText('CANCELLATION REQUESTED', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: ar ? 'طلب إلغاء من العميل' : 'Customer cancellation request', exact: true })).toBeVisible();
    await expect(page.getByText(reason, { exact: false }).first()).toBeVisible();
    // approval sits behind a deliberate confirmation disclosure; open it before checking the button
    await page.locator('summary', { hasText: ar ? 'الموافقة على الإلغاء' : 'Approve cancellation' }).click();
    await expect(page.getByRole('button', { name: ar ? 'الموافقة على الإلغاء' : 'Approve cancellation', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: ar ? 'رفض الإلغاء' : 'Reject cancellation', exact: true })).toBeVisible();
  });

  test('a submitted order shows status SUBMITTED and no cancellation decision controls', async ({ page, browser }, info) => {
    test.setTimeout(180_000);
    const lang = langOf(info.project.name);
    const ar = lang === 'ar';
    await setLang(page, lang);

    const order = await customerPlacesOrder(browser, { lang, locale: info.project.use.locale ?? 'en-US', viewport: info.project.use.viewport });
    await order.close();

    await openOrderFromList(page, lang, order.orderNumber);
    await expect(page.getByText('SUBMITTED', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: ar ? 'تعليق الطلب محلياً' : 'Put order on hold', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: ar ? 'طلب إلغاء من العميل' : 'Customer cancellation request', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: ar ? 'الموافقة على الإلغاء' : 'Approve cancellation', exact: true })).toHaveCount(0);
  });
});

import { test, expect } from '@playwright/test';
import { CUSTOMER_A, SKU_IN_STOCK, setLang, clearCartLine, langOf, placeOrderViaUi, managerApi } from './helpers';

/**
 * Cancellation (customer request, manager approval releases stock once) and reorder
 * (copies lines back into the cart at current prices). Acceptance: ORD-03, ACX-07, ACX-08.
 */
test.describe('order cancellation', () => {
  test('a customer requests cancellation and a manager approval cancels the order', async ({ page, baseURL }, info) => {
    test.setTimeout(150_000);
    const lang = langOf(info.project.name);
    await setLang(page, lang);
    const orderPath = await placeOrderViaUi(page, lang);

    // 1. customer asks for cancellation with a reason
    await page.goto(orderPath);
    const reasonLabel = lang === 'ar' ? 'السبب' : 'Reason';
    await page.getByLabel(new RegExp(reasonLabel)).fill('Ordered by mistake in the browser test');
    await page.getByRole('button', { name: lang === 'ar' ? 'إرسال طلب الإلغاء' : 'Send cancellation request' }).click();
    await expect(page.getByText(lang === 'ar' ? 'تم إرسال طلب الإلغاء.' : 'Cancellation request sent.')).toBeVisible();
    await page.reload();
    await expect(page.getByText(lang === 'ar' ? 'طلب الإلغاء' : 'Cancellation', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: lang === 'ar' ? 'إرسال طلب الإلغاء' : 'Send cancellation request' })).toHaveCount(0);

    // 2. a manager approves; the order becomes cancelled and its reservation is released exactly once
    const manager = await managerApi(baseURL!);
    const orderId = orderPath.split('/').pop()!;
    const approve = await manager.post(`/api/v1/admin/orders/${orderId}/cancellation`, {
      data: { approve: true, reason: 'approved in browser test' },
    });
    expect(approve.status()).toBe(200);
    await manager.dispose();

    await page.reload();
    await expect(page.getByText(lang === 'ar' ? 'هذا الطلب ملغى.' : 'This order was cancelled.')).toBeVisible();

    // 3. a second approval is refused (no double release)
    const again = await (await managerApi(baseURL!)).post(`/api/v1/admin/orders/${orderId}/cancellation`, {
      data: { approve: true, reason: 'again' },
    });
    expect(again.status()).toBe(409);
  });

  test('the cancellation form requires a reason', async ({ page }, info) => {
    const lang = langOf(info.project.name);
    await setLang(page, lang);
    const orderPath = await placeOrderViaUi(page, lang);
    await page.goto(orderPath);
    await page.getByRole('button', { name: lang === 'ar' ? 'إرسال طلب الإلغاء' : 'Send cancellation request' }).click();
    // the textarea is required: the request is not sent and no success message appears
    await expect(page.getByText(lang === 'ar' ? 'تم إرسال طلب الإلغاء.' : 'Cancellation request sent.')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(orderPath));
  });
});

test.describe('reorder', () => {
  test('reorder copies the order lines back into the cart and reports the result', async ({ page }, info) => {
    test.setTimeout(150_000);
    const lang = langOf(info.project.name);
    await setLang(page, lang);
    const orderPath = await placeOrderViaUi(page, lang);

    await page.goto(orderPath);
    await page.getByRole('button', { name: lang === 'ar' ? 'أعد الطلب إلى السلة' : 'Reorder to cart' }).click();
    await expect(page.getByRole('status').filter({ hasText: lang === 'ar' ? 'أُضيف' : 'added to your cart' }).first()).toBeVisible();

    await page.goto('/cart');
    await expect(page.getByText(SKU_IN_STOCK, { exact: false }).first()).toBeVisible();
    // the original order is unchanged: still listed with its status
    await page.goto(orderPath);
    await expect(page.getByText(/ORD-\d{8}-\d{6}/).first()).toBeVisible();

    await clearCartLine(page, SKU_IN_STOCK);
  });
});

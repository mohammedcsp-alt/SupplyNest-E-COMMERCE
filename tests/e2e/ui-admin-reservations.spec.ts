import { test, expect } from '@playwright/test';
import { langOf, setLang } from './helpers';
import { MANAGER_STATE, adminApi, answerDialogs, customerPlacesOrder } from './admin-helpers';

test.use({ storageState: MANAGER_STATE });

test.describe('inventory reservations', () => {
  test('manager extends, then releases a customer reservation; a second release is refused', async ({ page, browser }, info) => {
    test.setTimeout(240_000);
    const lang = langOf(info.project.name);
    const ar = lang === 'ar';
    await setLang(page, lang);

    // 1. the approved customer places an order, which creates an ACTIVE reservation
    const order = await customerPlacesOrder(browser, { lang, locale: info.project.use.locale ?? 'en-US', viewport: info.project.use.viewport });
    await order.close();

    // the reservation row is located by the order number
    const row = (p = page) => p.locator('tr', { hasText: order.orderNumber });
    answerDialogs(page, 'E2E release reason');

    await page.goto(`/admin/reservations?order=${order.orderNumber}`);
    await expect(row().getByText('ACTIVE', { exact: true })).toBeVisible();

    // a second manager tab that still shows the Release button, used later for the refused release
    const stale = await page.context().newPage();
    answerDialogs(stale, 'E2E release reason');
    await stale.goto(`/admin/reservations?order=${order.orderNumber}`);
    await expect(row(stale).getByText('ACTIVE', { exact: true })).toBeVisible();

    // 2. extend by 2 hours with a reason
    await row().locator('summary').click();
    await row().getByLabel(ar ? /ساعات إضافية/ : /Extra hours/).fill('2');
    await row().getByLabel(ar ? /^السبب \*$/ : /^Reason \*$/).fill('E2E extension reason');
    const extend = page.waitForResponse((r) => r.url().includes('/extend') && r.request().method() === 'POST');
    await row().getByRole('button', { name: ar ? 'تمديد الحجز' : 'Extend reservation', exact: true }).click();
    expect((await extend).status()).toBe(200);
    await expect(row().getByText('EXTENDED', { exact: true })).toBeVisible();

    // the stale tab still holds the pre-extension view; refresh it so it shows the EXTENDED row with Release
    await stale.reload();
    await expect(row(stale).getByText('EXTENDED', { exact: true })).toBeVisible();

    // 3. release with a reason (confirm + prompt handled by answerDialogs)
    const release = page.waitForResponse((r) => r.url().includes('/release') && r.request().method() === 'POST');
    await row().getByRole('button', { name: ar ? 'إفراج' : 'Release', exact: true }).click();
    expect((await release).status()).toBe(200);
    await expect(row().getByText('RELEASED', { exact: true })).toBeVisible();

    // API cross-check of the stored status
    const api = await adminApi();
    const listed = await api.get('/api/v1/admin/reservations?status=RELEASED');
    expect(listed.status()).toBe(200);
    const rows = ((await listed.json()) as { data: Array<{ orderNumber: string; status: string }> }).data;
    expect(rows.find((r) => r.orderNumber === order.orderNumber)?.status).toBe('RELEASED');
    await api.dispose();

    // 4. releasing again from the stale tab is refused and the error is shown in that row
    const second = stale.waitForResponse((r) => r.url().includes('/release') && r.request().method() === 'POST');
    await row(stale).getByRole('button', { name: ar ? 'إفراج' : 'Release', exact: true }).click();
    expect((await second).status()).toBeGreaterThanOrEqual(400);
    await expect(row(stale).getByRole('alert')).toBeVisible();
    await expect(row(stale).getByRole('alert')).not.toHaveText('');
    await stale.close();
  });
});

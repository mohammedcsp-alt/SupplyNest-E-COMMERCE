import { test, expect } from '@playwright/test';
import { langOf, setLang, type Lang } from './helpers';
import { MANAGER_STATE, PNG_1X1, adminApi, findSkuByApi, firstCategory, uniq } from './admin-helpers';

/** Manager session (signed in once by auth-manager.setup.ts). */
test.use({ storageState: MANAGER_STATE });

const L = {
  ar: {
    sku: 'رمز SKU *', category: 'الفئة *', nameAr: 'الاسم بالعربية *', nameEn: 'الاسم بالإنجليزية *',
    create: 'إنشاء SKU', created: 'تم إنشاء SKU.',
    levelA: /^LEVEL_A/, amount: 'السعر (دينار عراقي صحيح) *', reason: 'السبب *', savePrice: 'حفظ السعر',
    currency: 'د.ع', imagesHeading: 'الصور', imageFile: /ملف الصورة/, alt: /نص بديل/, uploadImage: 'رفع الصورة',
    imageCount: (n: number) => `الصور: ${n} من 10`,
  },
  en: {
    sku: 'SKU code *', category: 'Category *', nameAr: 'Name (Arabic) *', nameEn: 'Name (English) *',
    create: 'Create SKU', created: 'SKU created.',
    levelA: /^LEVEL_A/, amount: 'Price (whole IQD) *', reason: 'Reason *', savePrice: 'Save price',
    currency: 'IQD', imagesHeading: 'Images', imageFile: /Image file/, alt: /Alt text/, uploadImage: 'Upload image',
    imageCount: (n: number) => `Images: ${n} of 10`,
  },
} as const;

function labelsOf(lang: Lang) {
  return L[lang];
}

test.describe('admin catalog', () => {
  test('creates a SKU through the form and finds it in the list', async ({ page, baseURL }, info) => {
    test.setTimeout(120_000);
    const lang = langOf(info.project.name);
    const t = labelsOf(lang);
    await setLang(page, lang);
    const code = uniq('QA-E2E');
    const name = `E2E create ${code}`;

    await page.goto('/admin/catalog');
    const form = page.locator('form', { has: page.getByRole('button', { name: t.create, exact: true }) });
    await form.getByLabel(t.sku, { exact: true }).fill(code);
    // first real category option (index 0 is the empty "—" placeholder)
    await form.getByLabel(t.category, { exact: true }).selectOption({ index: 1 });
    await form.getByLabel(t.nameAr, { exact: true }).fill(`اختبار ${code.slice(-6)}`);
    await form.getByLabel(t.nameEn, { exact: true }).fill(name);

    const createResponse = page.waitForResponse((r) => r.url().includes('/api/v1/admin/skus') && r.request().method() === 'POST');
    await form.getByRole('button', { name: t.create, exact: true }).click();
    expect((await createResponse).status()).toBe(201);
    await expect(page.getByRole('status').filter({ hasText: t.created })).toBeVisible();

    // the form navigates back to the catalog after success; the SKU must be listed
    await page.goto(`/admin/catalog?q=${code}`);
    await expect(page.getByRole('cell', { name: code, exact: true })).toBeVisible();
    await expect(page.getByRole('cell').filter({ hasText: name }).first()).toBeVisible();

    const api = await adminApi();
    expect((await findSkuByApi(api, code))?.sku).toBe(code);
    await api.dispose();
  });

  test('changes the LEVEL_A tier price on the SKU detail page', async ({ page }, info) => {
    test.setTimeout(120_000);
    const lang = langOf(info.project.name);
    const t = labelsOf(lang);
    await setLang(page, lang);

    const api = await adminApi();
    const code = uniq('QA-PRICE');
    const cat = await firstCategory(api);
    const created = await api.post('/api/v1/admin/skus', {
      data: { sku: code, categoryId: cat.id, nameAr: 'سعر', nameEn: `E2E price ${code}`, unit: 'PCS', published: false, active: true },
    });
    expect(created.status()).toBe(201);
    const id = ((await created.json()) as { data: { id: string } }).data.id;

    const amount = 40000 + Math.floor(Math.random() * 50000);
    await page.goto(`/admin/catalog/${id}`);
    const row = page.locator('tr', { hasText: t.levelA });
    await row.getByLabel(t.amount, { exact: true }).fill(String(amount));
    await row.getByLabel(t.reason, { exact: true }).fill('E2E price change reason');
    const priceResponse = page.waitForResponse((r) => r.url().includes(`/api/v1/admin/skus/${id}/prices`) && r.request().method() === 'PUT');
    await row.getByRole('button', { name: t.savePrice, exact: true }).click();
    expect((await priceResponse).status()).toBe(200);

    // after the success reload the new amount is shown in the LEVEL_A row (formatted by the app)
    const expected = `${amount.toLocaleString('en-US')} ${t.currency}`;
    await expect(page.locator('tr', { hasText: t.levelA }).first()).toContainText(expected);
    await expect(page.getByRole('cell', { name: expected }).first()).toBeVisible();

    // API cross-check: the list endpoint returns the stored LEVEL_A amount
    const listed = await findSkuByApi(api, code);
    expect(listed?.prices?.find((p) => p.levelCode === 'LEVEL_A')?.amount).toBe(String(amount));
    await api.dispose();
  });

  test('uploads a PNG to a SKU and refuses a non-image file', async ({ page }, info) => {
    test.setTimeout(120_000);
    const lang = langOf(info.project.name);
    const t = labelsOf(lang);
    await setLang(page, lang);

    const api = await adminApi();
    const code = uniq('QA-IMG');
    const cat = await firstCategory(api);
    const created = await api.post('/api/v1/admin/skus', {
      data: { sku: code, categoryId: cat.id, nameAr: 'صورة', nameEn: `E2E image ${code}`, unit: 'PCS', published: false, active: true },
    });
    expect(created.status()).toBe(201);
    const id = ((await created.json()) as { data: { id: string } }).data.id;

    await page.goto(`/admin/catalog/${id}`);
    const section = page.locator('section', { has: page.getByRole('heading', { name: t.imagesHeading, exact: true }) });
    await expect(section.getByText(t.imageCount(0), { exact: true })).toBeVisible();

    const alt = `E2E pixel ${code}`;
    await section.getByLabel(t.imageFile).setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await section.getByLabel(t.alt).fill(alt);
    const uploadPng = page.waitForResponse((r) => r.url().includes(`/api/v1/admin/skus/${id}/images`) && r.request().method() === 'POST');
    await section.getByRole('button', { name: t.uploadImage, exact: true }).click();
    expect((await uploadPng).status()).toBe(201);

    // the page reloads after a successful upload: count goes from 0 to 1 and the caption is shown
    await expect(section.getByText(t.imageCount(1), { exact: true })).toBeVisible();
    await expect(section.getByText(alt, { exact: true })).toBeVisible();
    expect((await findSkuByApi(api, code))?.imageCount).toBe(1);

    // let the post-upload reload finish before selecting the next file
    await page.waitForLoadState("load");
    await page.waitForLoadState("networkidle");
    // a text file renamed to .png is refused by the server (magic-byte check)
    await section.getByLabel(t.imageFile).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('this is not an image') });
    const uploadButton = section.getByRole('button', { name: t.uploadImage, exact: true });
    await expect(uploadButton).toBeEnabled();
    const [uploadText] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/v1/admin/skus/${id}/images`) && r.request().method() === 'POST', { timeout: 20000 }),
      uploadButton.click(),
    ]);
    expect(uploadText.status()).toBeGreaterThanOrEqual(400);
    await expect(section.getByRole('alert')).toContainText(/JPEG|PNG|WebP/);
    await expect(section.getByText(t.imageCount(1), { exact: true })).toBeVisible();
    expect((await findSkuByApi(api, code))?.imageCount).toBe(1);
    await api.dispose();
  });
});

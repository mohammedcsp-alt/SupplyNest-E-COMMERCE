import { test, expect, type Page, type Locator } from '@playwright/test';
import { langOf, setLang, type Lang } from './helpers';
import { MANAGER_STATE, adminApi, findSkuByApi, firstCategory, uniq } from './admin-helpers';

test.use({ storageState: MANAGER_STATE });

const HEADER = 'SKU,NAME_EN,NAME_AR,MODEL,BRAND,QUALITY,CATEGORY,PHYSICAL_STOCK,EXTRACTED_AT';

/** One-row product CSV. Every field is quoted so a category name with spaces or commas stays one cell. */
function productCsv(sku: string, category: string, stock: number, extractedAt: string): Buffer {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const line = [q(sku), q(`E2E item ${sku}`), q('صنف اختبار'), q(''), q(''), q(''), q(category), q(String(stock)), q(extractedAt)].join(',');
  return Buffer.from(`${HEADER}\n${line}\n`, 'utf8');
}

const T = {
  ar: {
    section: 'استيراد المنتجات', preview: 'معاينة الملف', commit: 'اعتماد الاستيراد', committed: 'تم اعتماد الاستيراد.',
    overrideLabel: /ملف قديم|سبب اعتماد ملف قديم/,
  },
  en: {
    section: 'Product import', preview: 'Preview file', commit: 'Commit import', committed: 'Import committed.',
    overrideLabel: /Reason for committing a stale file/,
  },
} as const;

/** The "Product import" card. Price import is a separate card and is never touched by these tests. */
function productSection(page: Page, lang: Lang) {
  return page.locator('section', { has: page.getByRole('heading', { name: T[lang].section, exact: true }) });
}

/** Commit sits behind a "Commit import…" disclosure. Opens it once; never collapses an already-open one. */
async function openCommit(section: Locator, lang: Lang) {
  const details = section.locator('details.imp-commit');
  if (!(await details.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await details.locator('summary', { hasText: T[lang].commit }).click();
  }
}

/** Upload a CSV into the product panel and click Preview. Waits for the preview response. */
async function uploadPreview(page: Page, lang: Lang, name: string, buffer: Buffer) {
  const section = productSection(page, lang);
  await section.locator('input[type=file]').setInputFiles({ name, mimeType: 'text/csv', buffer });
  const preview = page.waitForResponse((r) => r.url().includes('/api/v1/admin/imports/products/preview') && r.request().method() === 'POST');
  await section.getByRole('button', { name: T[lang].preview, exact: true }).click();
  expect((await preview).status()).toBe(200);
  return section;
}

test.describe('product import', () => {
  test('a valid file is previewed, committed, and the SKU exists afterwards', async ({ page }, info) => {
    test.setTimeout(120_000);
    const lang = langOf(info.project.name);
    await setLang(page, lang);
    const api = await adminApi();
    const cat = await firstCategory(api);
    const sku = uniq('QA-IMP');

    await page.goto('/admin/imports');
    const section = await uploadPreview(page, lang, `products-${sku}.csv`, productCsv(sku, cat.nameEn, 12, '2030-01-15T08:00:00Z'));

    // preview shows the trusted freshness and the summary (one create, no row errors)
    await expect(section.getByText(/PREVIEW VALID/)).toBeVisible();
    await expect(section.getByText(/FRESH/).first()).toBeVisible();
    // The summary is rendered as KPI tiles (label span + value strong), not a definition list.
    await expect(section.locator('.adm-kpi').filter({ has: page.locator('span', { hasText: /^creates$/ }) }).locator('strong')).toHaveText('1');

    const commit = page.waitForResponse((r) => r.url().includes('/api/v1/admin/imports/products/') && r.url().endsWith('/commit'));
    await openCommit(section, lang);
    await section.getByRole('button', { name: T[lang].commit, exact: true }).click();
    expect((await commit).status()).toBe(200);
    await expect(section.getByRole('status').filter({ hasText: T[lang].committed })).toBeVisible();

    const listed = await findSkuByApi(api, sku);
    expect(listed?.sku).toBe(sku);
    expect(listed?.physicalOnHand).toBe(12);
    await page.goto(`/admin/catalog?q=${sku}`);
    await expect(page.getByRole('cell', { name: sku, exact: true })).toBeVisible();
    await api.dispose();
  });

  test('a file with an invalid row shows the error and cannot be committed', async ({ page }, info) => {
    test.setTimeout(120_000);
    const lang = langOf(info.project.name);
    await setLang(page, lang);
    const api = await adminApi();
    const sku = uniq('QA-BAD');

    await page.goto('/admin/imports');
    const section = await uploadPreview(page, lang, `bad-${sku}.csv`, productCsv(sku, 'NO SUCH CATEGORY E2E', 3, '2030-01-15T08:00:00Z'));

    await expect(section.getByText(/PREVIEW INVALID/)).toBeVisible();
    await expect(section.getByText(/^(أخطاء الصفوف|Row errors): 1$/)).toBeVisible();
    await expect(section.getByRole('cell', { name: 'CATEGORY_UNKNOWN', exact: true })).toBeVisible();
    // no commit control is offered for an invalid preview
    await expect(section.getByRole('button', { name: T[lang].commit, exact: true })).toHaveCount(0);
    expect(await findSkuByApi(api, sku)).toBeUndefined();
    await api.dispose();
  });

  test('a stale file needs a manager reason; without it the commit is refused, with it the commit succeeds', async ({ page }, info) => {
    test.setTimeout(150_000);
    const lang = langOf(info.project.name);
    await setLang(page, lang);
    const api = await adminApi();
    const cat = await firstCategory(api);
    const sku = uniq('QA-STALE');

    await page.goto('/admin/imports');
    // 1. newer extraction (10:00) is applied first
    let section = await uploadPreview(page, lang, `newer-${sku}.csv`, productCsv(sku, cat.nameEn, 5, '2030-06-01T10:00:00Z'));
    await expect(section.getByText(/PREVIEW VALID/)).toBeVisible();
    const firstCommit = page.waitForResponse((r) => r.url().endsWith('/commit'));
    await openCommit(section, lang);
    await section.getByRole('button', { name: T[lang].commit, exact: true }).click();
    expect((await firstCommit).status()).toBe(200);
    await expect(section.getByRole('status').filter({ hasText: T[lang].committed })).toBeVisible();
    expect((await findSkuByApi(api, sku))?.physicalOnHand).toBe(5);

    // 2. older extraction (09:00) for the same SKU is STALE and needs a manager reason
    section = await uploadPreview(page, lang, `older-${sku}.csv`, productCsv(sku, cat.nameEn, 7, '2030-06-01T09:00:00Z'));
    await expect(section.getByText(/STALE/).first()).toBeVisible();
    const reasonBox = section.getByLabel(T[lang].overrideLabel);
    await openCommit(section, lang); // the override reason is inside the commit disclosure
    await expect(reasonBox).toBeVisible();

    // 2a. commit without a reason is refused by the server; stock is unchanged
    const refused = page.waitForResponse((r) => r.url().endsWith('/commit'));
    await openCommit(section, lang);
    await section.getByRole('button', { name: T[lang].commit, exact: true }).click();
    expect((await refused).status()).toBeGreaterThanOrEqual(400);
    await expect(section.getByRole('alert')).toContainText(/older than data already applied|manager/i);
    expect((await findSkuByApi(api, sku))?.physicalOnHand).toBe(5);

    // 2b. with a reason (>= 3 characters) the commit succeeds and the older values are applied
    await reasonBox.fill('E2E manager override');
    const accepted = page.waitForResponse((r) => r.url().endsWith('/commit'));
    await openCommit(section, lang);
    await section.getByRole('button', { name: T[lang].commit, exact: true }).click();
    expect((await accepted).status()).toBe(200);
    await expect(section.getByRole('status').filter({ hasText: T[lang].committed })).toBeVisible();
    expect((await findSkuByApi(api, sku))?.physicalOnHand).toBe(7);
    await api.dispose();
  });
});

/**
 * DEVELOPMENT-ONLY demonstration content (V3.3). Idempotent: only fills empty fields, never overwrites admin-set values.
 * - Links generated demo images to synthetic SKUs (sku LIKE 'DEV-%') that have no image yet.
 * - Sets demo category images (dev-* categories with no image) and demo brand images (Synthetic* brands with no image).
 * - Marks two synthetic SKUs per demo category as featured, only when no SKU is featured yet.
 * - Creates three demo CMS banners (no discounts, no claims) and fills empty banner descriptions.
 * It never edits product names, prices, stock, categories or any non-DEV/non-Synthetic record.
 * Run: npm run demo:content   (requires the development database; see README.md)
 */
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { db } from '../../src/lib/db';
import { config } from '../../src/lib/config';

const DEMO_PRODUCTS = 'demo-products/';
const DEMO_CATEGORIES = 'demo-categories';
const DEMO_BRANDS = 'demo-brands';
const ROOT = path.resolve(__dirname, '..', '..');

async function copyDemo(srcRelative: string, dstKey: string) {
  const dst = path.resolve(config.UPLOAD_DIR, dstKey);
  await mkdir(path.dirname(dst), { recursive: true });
  await copyFile(path.resolve(ROOT, srcRelative), dst).catch(() => undefined);
  return dstKey;
}

async function main() {
  // 1. Product images
  const skus = await db.sku.findMany({
    where: { sku: { startsWith: 'DEV-' } },
    select: { id: true, sku: true, nameEn: true, images: { select: { id: true } } },
  });
  let imagesLinked = 0;
  for (const s of skus) {
    if (s.images.length > 0) continue;
    await db.skuImage.create({
      data: { skuId: s.id, fileKey: `${DEMO_PRODUCTS}${s.sku}.png`, mimeType: 'image/png', sortOrder: 0, altText: `Demo image: ${s.nameEn}` },
    });
    imagesLinked += 1;
  }

  // 2. Category images (dev-* categories only)
  const cats = await db.category.findMany({ where: { slug: { startsWith: 'dev-' } }, select: { id: true, slug: true, imageKey: true } });
  let categoryImages = 0;
  for (const c of cats) {
    if (c.imageKey) continue;
    const key = await copyDemo(`public/demo/categories/${c.slug}.png`, `${DEMO_CATEGORIES}/${c.slug}.png`);
    await db.category.update({ where: { id: c.id }, data: { imageKey: key } });
    categoryImages += 1;
  }

  // 3. Brand images (Synthetic* brands only); the source is a generated demo product drawing
  const brandSources: Record<string, string> = { 'Synthetic Acme': 'DEV-OF-1', 'Synthetic Contoso': 'DEV-TS-L-BL', 'Synthetic Northwind': 'DEV-BAT-1' };
  const brands = await db.brand.findMany({ where: { name: { startsWith: 'Synthetic' } }, select: { id: true, name: true, slug: true, imageKey: true } });
  let brandImages = 0;
  for (const b of brands) {
    if (b.imageKey || !brandSources[b.name]) continue;
    const key = await copyDemo(`storage/uploads/demo-products/${brandSources[b.name]}.png`, `${DEMO_BRANDS}/${b.slug}.png`);
    await db.brand.update({ where: { id: b.id }, data: { imageKey: key } });
    brandImages += 1;
  }

  // 4. Featured products: two per demo category, only when nothing is featured yet
  const anyFeatured = await db.sku.count({ where: { featured: true } });
  let featured = 0;
  if (anyFeatured === 0) {
    const perCat = await db.category.findMany({ where: { slug: { startsWith: 'dev-' } }, select: { id: true } });
    let order = 1;
    for (const c of perCat) {
      const picks = await db.sku.findMany({ where: { categoryId: c.id, sku: { startsWith: 'DEV-' } }, orderBy: { sku: 'asc' }, take: 2, select: { id: true } });
      for (const p of picks) {
        await db.sku.update({ where: { id: p.id }, data: { featured: true, featuredOrder: order } });
        order += 1;
        featured += 1;
      }
    }
  }

  // 5. Demo banners
  const existingBanners = await db.cmsBanner.findMany({ where: { imageKey: { startsWith: 'demo-banners/' } }, select: { id: true, descriptionEn: true } });
  let banners = 0;
  if (existingBanners.length === 0) {
    const rows = [
      { titleAr: 'كتالوج الجملة — ثماني فئات', titleEn: 'Wholesale catalogue — eight categories', descriptionAr: 'منتجات متعددة الفئات للحسابات المعتمدة.', descriptionEn: 'Multi-category merchandise for approved accounts.', linkLabelAr: 'تصفح الكتالوج', linkLabelEn: 'Browse catalogue', imageKey: 'demo-banners/banner-1.png', targetPath: '/catalog', position: 0 },
      { titleAr: 'طلب سريع للحسابات المعتمدة', titleEn: 'Quick ordering for approved accounts', descriptionAr: 'أدخل الرموز والكميات أو ارفع ملف Excel.', descriptionEn: 'Enter SKUs and quantities, or upload an Excel file.', linkLabelAr: 'ابدأ الطلب', linkLabelEn: 'Start an order', imageKey: 'demo-banners/banner-2.png', targetPath: '/bulk-order', position: 1 },
      { titleAr: 'وصل حديثًا إلى الكتالوج', titleEn: 'New arrivals in the catalogue', descriptionAr: 'أحدث الأصناف المضافة.', descriptionEn: 'The most recently added items.', linkLabelAr: 'عرض الوصول الحديث', linkLabelEn: 'View new arrivals', imageKey: 'demo-banners/banner-3.png', targetPath: '/catalog?sort=newest', position: 2 },
    ];
    for (const r of rows) {
      await db.cmsBanner.create({ data: { ...r, active: true } });
      banners += 1;
    }
  } else {
    for (const b of existingBanners.filter((x) => !x.descriptionEn)) {
      // Fill empty descriptions only.
      await db.cmsBanner.update({ where: { id: b.id }, data: { descriptionEn: 'Demonstration banner.', descriptionAr: 'بنر تجريبي للعرض.' } });
    }
  }

  console.log(JSON.stringify({ imagesLinked, categoryImages, brandImages, featured, bannersCreated: banners }));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

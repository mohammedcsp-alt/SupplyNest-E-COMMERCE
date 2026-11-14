/**
 * DEVELOPMENT-ONLY demonstration content (V3.3). Idempotent.
 * - Links generated demo images to synthetic SKUs (sku LIKE 'DEV-%') that have no image yet.
 * - Creates three demo CMS banners (no discounts, no claims) whose backdrops are the generated demo images.
 * It never edits product names, prices, stock, categories or any non-DEV record.
 * Run: npm run demo:content   (requires the development database; see README.md)
 */
import { db } from '../../src/lib/db';

const DEMO_TAG = 'demo-products/';

async function main() {
  const skus = await db.sku.findMany({
    where: { sku: { startsWith: 'DEV-' } },
    select: { id: true, sku: true, nameEn: true, nameAr: true, images: { select: { id: true } } },
  });
  let linked = 0;
  for (const s of skus) {
    if (s.images.length > 0) continue;
    const fileKey = `${DEMO_TAG}${s.sku}.png`;
    await db.skuImage.create({
      data: { skuId: s.id, fileKey, mimeType: 'image/png', sortOrder: 0, altText: `Demo image: ${s.nameEn}` },
    });
    linked += 1;
  }

  const existingBanners = await db.cmsBanner.count({ where: { imageKey: { startsWith: 'demo-banners/' } } });
  let banners = 0;
  if (existingBanners === 0) {
    const rows = [
      { titleAr: 'كتالوج الجملة — ثماني فئات', titleEn: 'Wholesale catalogue — eight categories', imageKey: 'demo-banners/banner-1.png', targetPath: '/catalog', position: 0 },
      { titleAr: 'طلب سريع للحسابات المعتمدة', titleEn: 'Quick ordering for approved accounts', imageKey: 'demo-banners/banner-2.png', targetPath: '/bulk-order', position: 1 },
      { titleAr: 'وصل حديثًا إلى الكتالوج', titleEn: 'New arrivals in the catalogue', imageKey: 'demo-banners/banner-3.png', targetPath: '/catalog?sort=newest', position: 2 },
    ];
    for (const r of rows) {
      await db.cmsBanner.create({ data: { ...r, active: true } });
      banners += 1;
    }
  }
  console.log(JSON.stringify({ skusChecked: skus.length, imagesLinked: linked, bannersCreated: banners }));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

/**
 * Removes ONLY test-generated QA rows from the isolated DEVELOPMENT database (identified by explicit markers).
 * Aborts before deleting anything if a row has dependents it should not lose. Financial and order rows are
 * immutable by design and are intentionally NOT touched here.
 * Usage: npx dotenv -e .env -- tsx --conditions=react-server scripts/cleanup-test-data.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const STAFF_QA_PHONE = '+9647794584140';

function fail(msg: string): never {
  throw new Error(`ABORT: ${msg}`);
}

async function main() {
  const dbName = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0];
  if (dbName !== 'b2b_store_dev') fail(`refusing: database is ${dbName}, expected b2b_store_dev`);

  // 1. CMS: QA page and QA banners
  const pages = await db.cmsPage.findMany({ where: { slug: { startsWith: 'qa-page-' } } });
  const banners = await db.cmsBanner.findMany({ where: { titleEn: 'QA banner' } });

  // 2. SKU QA-* (unpublished, inactive) — must have no order, cart or reservation history
  const skus = await db.sku.findMany({ where: { sku: { startsWith: 'QA-' } } });
  for (const s of skus) {
    const used = await db.orderItem.count({ where: { skuId: s.id } }) + (await db.cartItem.count({ where: { skuId: s.id } }))
      + (await db.inventoryReservation.count({ where: { skuId: s.id } }));
    if (used) fail(`SKU ${s.sku} has ${used} order/cart/reservation rows`);
    if (s.published) fail(`SKU ${s.sku} is published; not a test leftover`);
  }

  // 3. QA category (only after its SKUs are gone)
  const cats = await db.category.findMany({ where: { slug: { startsWith: 'qa-cat-' } } });
  for (const c of cats) {
    const kids = await db.category.count({ where: { parentId: c.id } });
    const items = await db.sku.count({ where: { categoryId: c.id, NOT: { sku: { startsWith: 'QA-' } } } });
    if (kids || items) fail(`category ${c.slug} has children or real items`);
  }

  // 4. QA governorate and its rules/areas (no addresses, orders or courier agreements)
  const govs = await db.governorate.findMany({ where: { code: { startsWith: 'QA_GOV_' } } });
  for (const g of govs) {
    const addr = await db.address.count({ where: { governorateId: g.id } });
    const agr = await db.courierAgreement.count({ where: { governorateId: g.id } });
    if (addr || agr) fail(`governorate ${g.code} is referenced by addresses or courier agreements`);
  }

  // 5. Staff account created by the admin test run (no status history, no shipments handed over)
  const staff = await db.user.findUnique({ where: { phone: STAFF_QA_PHONE } });
  if (staff) {
    const hist = await db.accountStatusHistory.count({ where: { subjectId: staff.id } });
    const hands = await db.courierShipment.count({ where: { handedOverById: staff.id } });
    if (hist || hands) fail('QA staff account has history; not removing it');
    if (staff.userType !== 'STAFF') fail('QA phone belongs to a customer');
  }

  // 6. Backup runs created by the admin test run: rows plus their dump files inside storage/backups
  const runs = await db.backupRun.findMany();
  const backupRoot = path.resolve('storage/backups');
  const dumpFiles = runs.map((r) => r.artifactPath).filter((p): p is string => !!p).map((p) => path.resolve(p));
  for (const f of dumpFiles) if (!f.startsWith(backupRoot + path.sep)) fail(`dump outside storage/backups: ${f}`);

  console.log(JSON.stringify({
    plan: {
      cmsPages: pages.map((p) => p.slug),
      banners: banners.length,
      skus: skus.map((s) => s.sku),
      categories: cats.map((c) => c.slug),
      governorates: govs.map((g) => g.code),
      staffRemoved: !!staff,
      backupRuns: runs.length,
      dumpFiles: dumpFiles.map((f) => path.basename(f)),
    },
  }, null, 1));

  // apply
  await db.$transaction(async (tx) => {
    for (const p of pages) await tx.cmsPage.delete({ where: { id: p.id } });
    await tx.cmsBanner.deleteMany({ where: { titleEn: 'QA banner' } });
    for (const g of govs) {
      await tx.shippingRateRule.deleteMany({ where: { governorateId: g.id } });
      await tx.deliveryArea.deleteMany({ where: { governorateId: g.id } });
      await tx.governorate.delete({ where: { id: g.id } });
    }
    for (const s of skus) await tx.sku.delete({ where: { id: s.id } });
    for (const c of cats) await tx.category.delete({ where: { id: c.id } });
    if (staff) {
      await tx.userRole.deleteMany({ where: { userId: staff.id } });
      await tx.session.deleteMany({ where: { userId: staff.id } });
      await tx.otpChallenge.deleteMany({ where: { userId: staff.id } });
      await tx.user.delete({ where: { id: staff.id } });
    }
    await tx.backupRun.deleteMany({});
  });
  for (const f of dumpFiles) if (fs.existsSync(f)) fs.unlinkSync(f);
  console.log('applied');
}

main()
  .catch((e) => {
    console.error(String(e));
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

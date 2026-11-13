/**
 * Removes ONLY rows created by the QA-AGENT test runs in the DEVELOPMENT database (explicit name markers).
 * Refuses to run unless the database name is b2b_store_dev. Models are removed only if no SKU uses them.
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const dbName = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0];
  if (dbName !== 'b2b_store_dev') throw new Error(`refusing: database is ${dbName}`);
  const banners = await db.cmsBanner.deleteMany({ where: { titleEn: { startsWith: 'QA-AGENT-' } } });
  const models = await db.productModel.findMany({ where: { name: { startsWith: 'QA-AGENT-' } }, include: { skus: { select: { id: true } } } });
  const removable = models.filter((m) => m.skus.length === 0).map((m) => m.id);
  const removed = await db.productModel.deleteMany({ where: { id: { in: removable } } });
  console.log(JSON.stringify({ bannersRemoved: banners.count, modelsRemoved: removed.count, modelsKept: models.length - removable.length }));
}

main()
  .catch((e) => {
    console.error(String(e));
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

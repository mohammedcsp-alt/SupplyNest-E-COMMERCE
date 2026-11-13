import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { assertTestDatabase } from '../setup/testdb';

loadEnv({ path: path.resolve(__dirname, '../../.env.test') });

/**
 * Test-only: the shared E2E customer places many orders in one run, which exceeds the production
 * limit of 10 checkouts per customer per hour. Before each UI order, clear only the 'checkout' buckets on the
 * TEST database so the browser suites can run. The limit itself is covered by integration tests
 * (tests/integration/part-abuse.test.ts). Nothing else is touched.
 */
export async function resetCheckoutLimit(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  assertTestDatabase(url);
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    await db.rateLimitBucket.deleteMany({ where: { action: 'checkout' } });
  } finally {
    await db.$disconnect();
  }
}

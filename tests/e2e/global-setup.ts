import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { assertTestDatabase } from '../setup/testdb';

loadEnv({ path: path.resolve(__dirname, '../../.env.test') });

/**
 * Before the E2E run: confirm we are on the TEST database, then clear the transient rate-limit buckets so
 * logins from earlier runs cannot block this run. Only the security_rate_limits table is touched.
 */
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;
  assertTestDatabase(url);
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    await db.$executeRawUnsafe('DELETE FROM "security_rate_limits"');
  } finally {
    await db.$disconnect();
  }
}

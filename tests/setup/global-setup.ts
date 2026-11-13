import { execSync } from 'node:child_process';
import { assertTestDatabase } from './testdb';

/**
 * Prepares the TEST database before the suite: applies pending migrations (non-destructive) and runs the
 * idempotent synthetic seed. It never resets or drops data, so tests create their own uniquely named fixtures
 * instead of depending on a clean slate. Runs only after the database identity check passes.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  assertTestDatabase(url);
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url!, NODE_ENV: 'test' };
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env, cwd: process.cwd() });
  execSync('npx tsx prisma/seed/index.ts', { stdio: 'inherit', env, cwd: process.cwd() });
}

/**
 * Test-database safety. Every test run must prove it is pointed at the dedicated, isolated test database
 * before any write happens (spec section 12: identity check before write tests; no WMS/prod access).
 */
export const TEST_DB_NAME = 'b2b_store_test';
export const TEST_DB_HOST = '127.0.0.1';
export const TEST_DB_PORT = '5440';

export function assertTestDatabase(url: string | undefined): void {
  if (!url) throw new Error('TEST_DATABASE_URL is not set; refusing to run destructive tests');
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('Test database URL is malformed; refusing to run');
  }
  const dbName = u.pathname.replace(/^\//, '');
  const forbiddenPorts = ['3100', '5432', '5433', '8333'];
  if (dbName !== TEST_DB_NAME) throw new Error(`Refusing to run: database "${dbName}" is not "${TEST_DB_NAME}"`);
  if (u.hostname !== TEST_DB_HOST || u.port !== TEST_DB_PORT) {
    throw new Error(`Refusing to run: host ${u.hostname}:${u.port} is not ${TEST_DB_HOST}:${TEST_DB_PORT}`);
  }
  if (forbiddenPorts.includes(u.port)) throw new Error('Refusing to run against a forbidden port');
}

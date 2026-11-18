/**
 * Decides whether the seed may write the local credential sheet (DEV-CREDENTIALS.local.md).
 *
 * SEC-005: automated tests run the seed against b2b_store_test. That run must never rewrite the sheet that describes the
 * development / UAT database. The sheet is written only when the seed targets the development database by name and
 * the URL is not the test database.
 */
export const DEV_DATABASE_NAME = 'b2b_store_dev';
export const TEST_DATABASE_NAME = 'b2b_store_test';

export function databaseNameOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const name = new URL(url).pathname.replace(/^\//, '');
    return name || null;
  } catch {
    return null;
  }
}

export function shouldWriteCredentialSheet(databaseUrl: string | undefined): boolean {
  const name = databaseNameOf(databaseUrl);
  if (name === null) return false;
  if (name === TEST_DATABASE_NAME) return false;
  return name === DEV_DATABASE_NAME;
}

/**
 * Next.js startup hook. Refuses to start in production with development adapters
 * (mock OTP, SMS without credentials, WMS flag on). Runs once per server process.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { assertProductionSafe } = await import('@/lib/config');
  assertProductionSafe();
}

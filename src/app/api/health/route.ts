import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Liveness + database health probe used by scripts/b2b-supervisor.ps1 and by operators.
 * Returns only a status word. No connection string, host, error text or stack trace is ever included.
 */
export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', database: 'up' }, { status: 200, headers });
  } catch {
    return Response.json({ status: 'degraded', database: 'down' }, { status: 503, headers });
  }
}

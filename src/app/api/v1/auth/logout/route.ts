import { cookies } from 'next/headers';
import { apiRoute, ok } from '@/lib/api';
import { SESSION_COOKIE, revokeSessionByToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(async (_req, _ctx, requestId) => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSessionByToken(token);
  store.delete(SESSION_COOKIE);
  return ok(requestId, { loggedOut: true });
});

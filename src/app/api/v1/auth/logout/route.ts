import { cookies } from 'next/headers';
import { apiRoute, ok, requestScheme } from '@/lib/api';
import { SESSION_COOKIE, revokeSessionByToken, sessionCookieClearOptions } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const POST = apiRoute(async (req, _ctx, requestId) => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSessionByToken(token);
  // Same attributes as the session cookie (Secure over HTTPS), so the browser clears the cookie it actually holds.
  store.set(SESSION_COOKIE, '', sessionCookieClearOptions(requestScheme(req)));
  return ok(requestId, { loggedOut: true });
});

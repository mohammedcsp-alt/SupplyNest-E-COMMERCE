import { cookies } from 'next/headers';
import { apiRoute, clientIp, ok, readJson, requestScheme } from '@/lib/api';
import { errors } from '@/lib/errors';
import { getCurrentUser, SESSION_COOKIE, sessionCookieClearOptions } from '@/lib/session';
import { changeOwnPassword } from '@/modules/identity/auth-service';
import { changePasswordSchema } from '@/modules/identity/schemas';

export const dynamic = 'force-dynamic';

/** Signed-in password change. Every session, including this one, is signed out; the user signs in again. */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const user = await getCurrentUser();
  if (!user) throw errors.unauthorized();
  const body = await readJson(req, changePasswordSchema);
  await changeOwnPassword({ userId: user.id, currentPassword: body.currentPassword, newPassword: body.newPassword, ip: clientIp(req) });
  (await cookies()).set(SESSION_COOKIE, '', sessionCookieClearOptions(requestScheme(req)));
  return ok(requestId, { changed: true, signedOut: true });
});

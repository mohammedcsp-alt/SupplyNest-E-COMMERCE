import { cookies } from 'next/headers';
import { apiRoute, clientIp, ok, readJson } from '@/lib/api';
import { authenticate } from '@/modules/identity/auth-service';
import { loginSchema } from '@/modules/identity/schemas';
import { createSession, getCurrentUser, sessionCookieOptions, SESSION_COOKIE } from '@/lib/session';
import { writeAudit } from '@/lib/audit';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** AUTH-01: password login. Rate-limited per IP (10/15 min) and per account (5/15 min). */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const body = await readJson(req, loginSchema);
  const ip = clientIp(req);
  const user = await authenticate({ phone: body.phone, password: body.password, ip });

  const { token, expiresAt } = await createSession(user.id, req.headers.get('user-agent'));
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  await writeAudit(db, { actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, ip });

  const me = await getCurrentUser();
  return ok(requestId, {
    id: user.id,
    status: user.status,
    userType: user.userType,
    displayName: me?.displayName ?? user.phone,
    permissions: me ? [...me.permissions].sort() : [],
  });
});

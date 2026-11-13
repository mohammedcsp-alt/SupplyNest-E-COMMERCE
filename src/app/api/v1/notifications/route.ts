import { z } from 'zod';
import { apiRoute, ok, readJson } from '@/lib/api';
import { getCurrentUser, requireUser } from '@/lib/session';
import { listNotifications, markRead } from '@/modules/notifications/notify';

export const dynamic = 'force-dynamic';

/** CUSTOMER-008 / CUS-16: in-site notifications only. */
export const GET = apiRoute(async (_req, _ctx, requestId) => {
  const user = requireUser(await getCurrentUser());
  const rows = await listNotifications(user.id);
  return ok(requestId, rows.map((n) => ({ id: n.id, type: n.type, payload: n.payload, read: !!n.readAt, createdAt: n.createdAt })));
});

const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

export const POST = apiRoute(async (req, _ctx, requestId) => {
  const user = requireUser(await getCurrentUser());
  const body = await readJson(req, schema);
  await markRead(user.id, body.ids);
  return ok(requestId, { marked: body.ids.length });
});

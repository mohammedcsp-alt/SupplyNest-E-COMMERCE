import { z } from 'zod';
import { apiRoute, clientIp, ok, readJson, type RouteContext } from '@/lib/api';
import { errors } from '@/lib/errors';
import { getCurrentUser, requireUser } from '@/lib/session';
import { requestCancellation } from '@/modules/commerce/orders';

export const dynamic = 'force-dynamic';

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

/** ORD-03 / CUS-13: cancellations never happen directly; a manager must approve (ORD-003). */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const user = requireUser(await getCurrentUser());
  if (user.userType !== 'CUSTOMER') throw errors.forbidden('Customer account required');
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  return ok(requestId, await requestCancellation({ customerId: user.id, orderId: id, reason: body.reason, ip: clientIp(req) }));
});

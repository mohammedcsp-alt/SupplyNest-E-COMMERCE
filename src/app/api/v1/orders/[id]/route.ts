import { z } from 'zod';
import { apiRoute, clientIp, ok, readJson, type RouteContext } from '@/lib/api';
import { errors } from '@/lib/errors';
import { getCurrentUser, requireUser, requireActiveCustomer } from '@/lib/session';
import { editOrder, getCustomerOrder } from '@/modules/commerce/orders';

export const dynamic = 'force-dynamic';

export const GET = apiRoute<{ id: string }>(async (_req, ctx: RouteContext<{ id: string }>, requestId) => {
  const user = requireUser(await getCurrentUser());
  if (user.userType !== 'CUSTOMER') throw errors.forbidden('Customer account required');
  const { id } = await ctx.params;
  return ok(requestId, await getCustomerOrder(user.id, id));
});

const editSchema = z.object({
  expectedVersion: z.number().int().min(1),
  lines: z.array(z.object({ sku: z.string().trim().min(1).max(64), qty: z.number().int().min(0).max(100000) })).max(200),
  acceptPriceChanges: z.boolean().default(false),
});

/**
 * ORD-02 / CUS-12: replaces the order's lines before preparation starts. Unchanged lines keep their price snapshot;
 * changed or new lines are repriced and need acceptPriceChanges=true when the price differs.
 */
export const PATCH = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const user = requireActiveCustomer(await getCurrentUser());
  const { id } = await ctx.params;
  const body = await readJson(req, editSchema);
  const order = await editOrder({
    customerId: user.id,
    priceLevelId: user.priceLevelId!,
    priceLevelCode: user.priceLevelCode!,
    orderId: id,
    expectedVersion: body.expectedVersion,
    lines: body.lines,
    acceptPriceChanges: body.acceptPriceChanges,
    ip: clientIp(req),
  });
  return ok(requestId, order);
});

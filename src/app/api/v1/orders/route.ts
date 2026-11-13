import { z } from 'zod';
import { OrderStatus } from '@prisma/client';
import { apiRoute, idempotencyKeyOf, ok, readJson } from '@/lib/api';
import { errors } from '@/lib/errors';
import { getCurrentUser, requireActiveCustomer, requireUser } from '@/lib/session';
import { placeOrder } from '@/modules/commerce/checkout';
import { listCustomerOrders, presentOrder } from '@/modules/commerce/orders';

export const dynamic = 'force-dynamic';

const placeSchema = z.object({
  addressId: z.string().uuid(),
  quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
  note: z.string().trim().max(500).nullable().optional(),
});

/**
 * CUS-09 / ORD-01: places a COD order. REQUIRES Idempotency-Key. Replays return the original order.
 * Status 201 for a new order, 200 for an idempotent replay.
 */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const user = requireActiveCustomer(await getCurrentUser());
  const key = idempotencyKeyOf(req);
  const body = await readJson(req, placeSchema);
  const result = await placeOrder({ customerId: user.id, idempotencyKey: key, ...body, note: body.note ?? null });
  return ok(requestId, presentOrder({ ...result.order, addressSnapshot: result.order.addressSnapshot }), {
    status: result.replayed ? 200 : 201,
    meta: { replayed: result.replayed },
  });
});

const STATUSES = Object.values(OrderStatus);

/** CUS-10: the caller's own orders. Suspended and pending accounts keep read access to their history (OPEN-20). */
export const GET = apiRoute(async (req, _ctx, requestId) => {
  const user = requireUser(await getCurrentUser());
  if (user.userType !== 'CUSTOMER') throw errors.forbidden('Customer account required');
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  if (status && !(STATUSES as string[]).includes(status)) throw errors.validation('Unknown status');
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(sp.get('pageSize') ?? 20) || 20));
  const { items, total } = await listCustomerOrders(user.id, { status: status as OrderStatus | undefined, page, pageSize });
  return ok(requestId, items, { meta: { page, pageSize, total } });
});

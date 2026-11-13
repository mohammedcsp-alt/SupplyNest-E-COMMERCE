import { z } from 'zod';
import { apiRoute, ok, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { getCurrentUser, requireActiveCustomer } from '@/lib/session';
import { buildQuote, presentQuote } from '@/modules/commerce/quote';

export const dynamic = 'force-dynamic';

const schema = z.object({ addressId: z.string().uuid() });

/**
 * CUS-09 / ORD-01: the checkout review. Returns current prices, delivery fee, warnings and the quote hash the
 * customer must confirm. Read-only: no reservation is created here.
 */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const user = requireActiveCustomer(await getCurrentUser());
  const body = await readJson(req, schema);
  const quote = await db.$transaction((tx) => buildQuote(tx, { customerId: user.id, addressId: body.addressId }), { isolationLevel: 'ReadCommitted' });
  return ok(requestId, presentQuote(quote));
});

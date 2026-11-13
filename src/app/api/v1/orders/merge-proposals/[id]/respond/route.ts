import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requireActiveCustomer } from '@/lib/session';
import { respondMerge } from '@/modules/commerce/orders';

export const dynamic = 'force-dynamic';

const schema = z.object({ accept: z.boolean() });

export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const user = requireActiveCustomer(await getCurrentUser());
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  const p = await respondMerge({ customerId: user.id, proposalId: id, accept: body.accept });
  return ok(requestId, { id: p.id, status: p.status });
});

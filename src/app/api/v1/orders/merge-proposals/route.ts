import { z } from 'zod';
import { apiRoute, ok, readJson } from '@/lib/api';
import { getCurrentUser, requireActiveCustomer } from '@/lib/session';
import { proposeMerge } from '@/modules/commerce/orders';

export const dynamic = 'force-dynamic';

const schema = z.object({
  orderIds: z.array(z.string().uuid()).min(2).max(20),
  rationale: z.string().trim().min(3).max(500),
});

/** ORD-04 / CUS-14: suggest merging orders. Records a PROPOSAL only; nothing merges automatically. */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const user = requireActiveCustomer(await getCurrentUser());
  const body = await readJson(req, schema);
  const proposal = await proposeMerge({ customerId: user.id, orderIds: body.orderIds, rationale: body.rationale });
  return ok(requestId, { id: proposal.id, status: proposal.status }, { status: 201 });
});

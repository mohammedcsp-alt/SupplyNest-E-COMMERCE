import { apiRoute, ok } from '@/lib/api';
import { errors } from '@/lib/errors';
import { getCurrentUser, canSeePrices, canOrder } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Current session summary. Never includes price values (prices are served only by entitled endpoints). */
export const GET = apiRoute(async (_req, _ctx, requestId) => {
  const user = await getCurrentUser();
  if (!user) throw errors.unauthorized();
  return ok(requestId, {
    id: user.id,
    displayName: user.displayName,
    userType: user.userType,
    status: user.status,
    canSeePrices: canSeePrices(user),
    canOrder: canOrder(user),
    priceLevelCode: canSeePrices(user) ? user.priceLevelCode : null,
    permissions: [...user.permissions].sort(),
  });
});

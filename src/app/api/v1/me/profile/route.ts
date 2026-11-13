import { apiRoute, ok, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { getCurrentUser, requireUser, canSeePrices } from '@/lib/session';
import { updateOwnProfile } from '@/modules/identity/customer-service';
import { profileUpdateSchema } from '@/modules/identity/schemas';

export const dynamic = 'force-dynamic';

/** Own profile. legalName is locked once the account has been approved (CUSTOMER-005). */
export const GET = apiRoute(async (_req, _ctx, requestId) => {
  const user = requireUser(await getCurrentUser());
  const profile = await db.customerProfile.findUnique({ where: { userId: user.id }, include: { priceLevel: true } });
  if (!profile) throw errors.notFound('Profile not found');
  return ok(requestId, {
    displayName: profile.displayName,
    legalName: profile.legalName,
    businessIdentityLocked: profile.businessIdentityLocked,
    phone: user.phone,
    status: user.status,
    priceLevelCode: canSeePrices(user) ? (profile.priceLevel?.code ?? null) : null,
  });
});

/** Updates displayName, and legalName while it is not locked. */
export const PATCH = apiRoute(async (req, _ctx, requestId) => {
  const user = requireUser(await getCurrentUser());
  const body = await readJson(req, profileUpdateSchema);
  const updated = await updateOwnProfile(user, body);
  return ok(requestId, {
    displayName: updated.displayName,
    legalName: updated.legalName,
    businessIdentityLocked: updated.businessIdentityLocked,
  });
});

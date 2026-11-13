import type { AccountStatus } from '@prisma/client';
import { apiRoute, ok } from '@/lib/api';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const STATUSES: AccountStatus[] = ['REGISTERED', 'APPROVAL_PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED'];

/** ADM-04: customer list with status/search filters. Requires customer.view. */
export const GET = apiRoute(async (req, _ctx, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.CUSTOMER_VIEW);
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  if (status && !STATUSES.includes(status as AccountStatus)) throw errors.validation('Unknown status filter');
  const q = (sp.get('q') ?? '').trim().slice(0, 80);
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get('pageSize') ?? 25) || 25));

  const where = {
    userType: 'CUSTOMER' as const,
    ...(status ? { status: status as AccountStatus } : {}),
    ...(q
      ? {
          OR: [
            { phone: { contains: q } },
            { customerProfile: { displayName: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { customerProfile: { include: { priceLevel: true } } },
    }),
    db.user.count({ where }),
  ]);
  return ok(requestId, {
    items: rows.map((u) => ({
      id: u.id,
      phone: u.phone,
      status: u.status,
      displayName: u.customerProfile?.displayName ?? null,
      priceLevelCode: u.customerProfile?.priceLevel?.code ?? null,
      createdAt: u.createdAt,
      phoneVerifiedAt: u.phoneVerifiedAt,
    })),
  }, { meta: { page, pageSize, total } });
});

import { z } from 'zod';
import { apiRoute, ok, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { getCurrentUser, requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** UX-009 / CUS-05: recently viewed SKUs, private to the account. Shows SKU codes and names only. */
export const GET = apiRoute(async (_req, _ctx, requestId) => {
  const user = requireUser(await getCurrentUser());
  if (user.userType !== 'CUSTOMER') throw errors.forbidden('Customer account required');
  const rows = await db.recentView.findMany({ where: { customerId: user.id }, orderBy: { viewedAt: 'desc' }, take: 20, include: { sku: { select: { sku: true, nameEn: true, nameAr: true, published: true, active: true } } } });
  return ok(requestId, rows.filter((r) => r.sku.published && r.sku.active).map((r) => ({ sku: r.sku.sku, nameEn: r.sku.nameEn, nameAr: r.sku.nameAr, viewedAt: r.viewedAt })));
});

const schema = z.object({ sku: z.string().trim().min(1).max(64) });

export const POST = apiRoute(async (req, _ctx, requestId) => {
  const user = requireUser(await getCurrentUser());
  if (user.userType !== 'CUSTOMER') return ok(requestId, { recorded: false });
  const body = await readJson(req, schema);
  const sku = await db.sku.findFirst({ where: { sku: body.sku.toUpperCase(), published: true, active: true }, select: { id: true } });
  if (sku) {
    await db.recentView.upsert({
      where: { customerId_skuId: { customerId: user.id, skuId: sku.id } },
      update: { viewedAt: new Date() },
      create: { customerId: user.id, skuId: sku.id },
    });
  }
  return ok(requestId, { recorded: !!sku });
});

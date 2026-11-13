import { z } from 'zod';
import { apiRoute, ok, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { getCurrentUser, requireUser, viewerOf } from '@/lib/session';
import { projectSkusForViewer } from '@/modules/catalog/public';

export const dynamic = 'force-dynamic';

/** CUS-04 / UX-008: favorites with the price at the customer's current level. */
export const GET = apiRoute(async (_req, _ctx, requestId) => {
  const user = requireUser(await getCurrentUser());
  if (user.userType !== 'CUSTOMER') throw errors.forbidden('Customer account required');
  const favs = await db.favorite.findMany({ where: { customerId: user.id }, select: { sku: { select: { sku: true } } }, orderBy: { createdAt: 'desc' } });
  const skuCodes = favs.map((f) => f.sku.sku);
  return ok(requestId, await projectSkusForViewer(skuCodes, viewerOf(user)));
});

const addSchema = z.object({ sku: z.string().trim().min(1).max(64) });

export const POST = apiRoute(async (req, _ctx, requestId) => {
  const user = requireUser(await getCurrentUser());
  if (user.userType !== 'CUSTOMER') throw errors.forbidden('Customer account required');
  const body = await readJson(req, addSchema);
  const sku = await db.sku.findFirst({ where: { sku: body.sku.toUpperCase(), published: true, active: true, deletedAt: null }, select: { id: true } });
  if (!sku) throw errors.notFound('Product not found');
  await db.favorite.upsert({ where: { customerId_skuId: { customerId: user.id, skuId: sku.id } }, update: {}, create: { customerId: user.id, skuId: sku.id } });
  return ok(requestId, { saved: true }, { status: 201 });
});

export const DELETE = apiRoute(async (req, _ctx, requestId) => {
  const user = requireUser(await getCurrentUser());
  const code = req.nextUrl.searchParams.get('sku')?.toUpperCase() ?? '';
  const sku = await db.sku.findUnique({ where: { sku: code }, select: { id: true } });
  if (sku) await db.favorite.deleteMany({ where: { customerId: user.id, skuId: sku.id } });
  return ok(requestId, { removed: true });
});

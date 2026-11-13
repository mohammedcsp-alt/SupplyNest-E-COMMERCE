import { apiRoute, ok, type RouteContext } from '@/lib/api';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

/** Import history detail: status, freshness, summary and row errors. Payload contents are not returned. */
export const GET = apiRoute<{ id: string }>(async (_req, ctx: RouteContext<{ id: string }>, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.IMPORT_PREVIEW);
  const { id } = await ctx.params;
  const batch = await db.importBatch.findUnique({ where: { id }, include: { errors: { orderBy: { rowNumber: 'asc' }, take: 500 } } });
  if (!batch) throw errors.notFound('Import not found');
  return ok(requestId, {
    id: batch.id,
    type: batch.type,
    filename: batch.filename,
    status: batch.status,
    freshness: batch.freshness,
    sourceGeneratedAt: batch.sourceGeneratedAt,
    summary: batch.summary,
    overrideReason: batch.overrideReason,
    createdAt: batch.createdAt,
    committedAt: batch.committedAt,
    errors: batch.errors.map((e) => ({ rowNumber: e.rowNumber, field: e.field, code: e.code, message: e.message })),
  });
});

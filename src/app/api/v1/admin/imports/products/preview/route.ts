import { apiRoute, ok, type RouteContext } from '@/lib/api';
import { errors } from '@/lib/errors';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { previewProductImport } from '@/modules/imports/products-import';

export const dynamic = 'force-dynamic';

/** IMP-01 step 1: upload and validate the whole file. Nothing is applied. */
export const POST = apiRoute(async (req, _ctx: RouteContext<Record<string, string>>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.IMPORT_PREVIEW);
  const form = await req.formData().catch(() => {
    throw errors.validation('Expected multipart/form-data with a "file" field');
  });
  const file = form.get('file');
  if (!(file instanceof File)) throw errors.validation('Field "file" is required');
  const { batch, outcome } = await previewProductImport({ buffer: Buffer.from(await file.arrayBuffer()), filename: file.name || 'upload', actorId: actor.id });
  return ok(requestId, {
    importId: batch.id,
    status: batch.status,
    freshness: outcome.freshness,
    extractedAt: outcome.extractedAt,
    summary: outcome.summary,
    staleSkuCount: outcome.staleSkus.length,
    errors: outcome.issues.slice(0, 200),
    errorCount: outcome.issues.length,
  });
});

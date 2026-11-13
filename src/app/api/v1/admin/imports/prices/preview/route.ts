import { apiRoute, ok } from '@/lib/api';
import { errors } from '@/lib/errors';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { previewPriceImport } from '@/modules/imports/prices-import';

export const dynamic = 'force-dynamic';

/** PRODUCT-007: price file preview (SKU, PRICE_LEVEL, PRICE). */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.PRICE_EDIT);
  const form = await req.formData().catch(() => {
    throw errors.validation('Expected multipart/form-data with a "file" field');
  });
  const file = form.get('file');
  if (!(file instanceof File)) throw errors.validation('Field "file" is required');
  const { batch, issues, valid } = await previewPriceImport({ buffer: Buffer.from(await file.arrayBuffer()), filename: file.name || 'upload', actorId: actor.id });
  return ok(requestId, { importId: batch.id, status: batch.status, valid, errorCount: issues.length, errors: issues.slice(0, 200) });
});

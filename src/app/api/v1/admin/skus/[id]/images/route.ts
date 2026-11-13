import { apiRoute, clientIp, ok, type RouteContext } from '@/lib/api';
import { errors } from '@/lib/errors';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { addSkuImage, MAX_IMAGES_PER_SKU } from '@/modules/catalog/admin';

export const dynamic = 'force-dynamic';

/** PRODUCT-006: uploads one image (multipart field "file"). Max 10 per SKU, enforced in DB and service. */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.IMAGE_MANAGE);
  const { id } = await ctx.params;
  const form = await req.formData().catch(() => {
    throw errors.validation('Expected multipart/form-data with a "file" field');
  });
  const file = form.get('file');
  if (!(file instanceof Blob)) throw errors.validation('Field "file" is required');
  const altText = form.get('altText');
  const img = await addSkuImage(actor.id, {
    skuId: id,
    bytes: Buffer.from(await file.arrayBuffer()),
    altText: typeof altText === 'string' ? altText.slice(0, 200) : null,
    ip: clientIp(req),
  });
  return ok(requestId, { id: img.id, url: `/api/v1/media/${img.id}`, limit: MAX_IMAGES_PER_SKU }, { status: 201 });
});

import 'server-only';
import { apiRoute, clientIp, ok, type RouteContext } from '@/lib/api';
import { errors } from '@/lib/errors';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { clearOwnerImage, readOwnerImage, setOwnerImage, type ImageOwner } from './media';
import { requireUuid } from '@/modules/admin/ids';

/** Admin upload/remove handlers for one owner type. The permission is checked before any file is read. */
export function adminImageHandlers(owner: ImageOwner, permission: string) {
  const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
    const actor = requirePermission(await getCurrentUser(), permission);
    const id = requireUuid((await ctx.params).id);
    const form = await req.formData().catch(() => {
      throw errors.validation('Expected multipart/form-data with a "file" field');
    });
    const file = form.get('file');
    if (!(file instanceof Blob)) throw errors.validation('Field "file" is required');
    const result = await setOwnerImage(actor.id, owner, id, Buffer.from(await file.arrayBuffer()), clientIp(req));
    return ok(requestId, result, { status: 201 });
  });
  const DELETE = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
    const actor = requirePermission(await getCurrentUser(), permission);
    const id = requireUuid((await ctx.params).id);
    return ok(requestId, await clearOwnerImage(actor.id, owner, id, clientIp(req)));
  });
  return { POST, DELETE };
}

/** Public image read for ACTIVE owners only. Returns 404 for anything else (no existence leak). */
export function publicImageHandler(owner: ImageOwner) {
  return apiRoute<{ id: string }>(async (_req, ctx: RouteContext<{ id: string }>) => {
    const id = requireUuid((await ctx.params).id);
    const img = await readOwnerImage(owner, id, { publicOnly: true });
    if (!img) throw errors.notFound('Image not found');
    return new Response(new Uint8Array(img.bytes), {
      status: 200,
      headers: { 'Content-Type': img.mime, 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' },
    });
  });
}

import { apiRoute, clientIp, ok, readJson } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { listSettings, settingUpdateSchema, updateSetting } from '@/modules/admin/settings';

export const dynamic = 'force-dynamic';

/** Business settings with defaults and allowed ranges. */
export const GET = apiRoute(async (_req, _ctx, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.SETTINGS_MANAGE);
  return ok(requestId, await listSettings());
});

/** Updates one setting. Values outside the documented range are rejected; currency is fixed to IQD. Audited. */
export const PUT = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.SETTINGS_MANAGE);
  const body = await readJson(req, settingUpdateSchema);
  return ok(requestId, await updateSetting(actor.id, body.key, body.value, clientIp(req)));
});

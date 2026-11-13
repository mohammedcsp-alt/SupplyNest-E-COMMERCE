import { apiRoute, ok } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS, PERMISSION_DESCRIPTIONS } from '@/lib/rbac';
import { listPermissions, listRoles } from '@/modules/admin/roles';

export const dynamic = 'force-dynamic';

/** Roles with their permission codes, plus the permission catalogue (code and description). */
export const GET = apiRoute(async (_req, _ctx, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.ROLE_MANAGE);
  const [roles, permissions] = await Promise.all([listRoles(), listPermissions()]);
  return ok(requestId, {
    roles,
    permissions: permissions.map((p) => ({ code: p.code, description: PERMISSION_DESCRIPTIONS[p.code as keyof typeof PERMISSION_DESCRIPTIONS] ?? p.description })),
  });
});

import { z } from 'zod';
import { apiRoute, clientIp, ok, readJson } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { createStaffUser } from '@/modules/admin/roles';

export const dynamic = 'force-dynamic';

const schema = z.object({
  phone: z.string().trim().min(7).max(20),
  fullNameEn: z.string().trim().min(2).max(120),
  password: z.string().min(10).max(128),
  roleNames: z.array(z.string().trim().min(2).max(80)).min(1, 'Select at least one role').max(20),
});

/** Creates an active STAFF user with roles. The password is hashed; no secret is returned. Audited. */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.ROLE_MANAGE);
  const body = await readJson(req, schema);
  return ok(requestId, await createStaffUser(actor.id, body, clientIp(req)), { status: 201 });
});

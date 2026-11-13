import { apiRoute, ok, readJson } from '@/lib/api';
import { completeRecovery } from '@/modules/identity/auth-service';
import { recoveryConfirmSchema } from '@/modules/identity/schemas';

export const dynamic = 'force-dynamic';

/** AUTH-04: sets a new password after OTP verification and revokes all existing sessions. */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const body = await readJson(req, recoveryConfirmSchema);
  await completeRecovery(body);
  return ok(requestId, { passwordReset: true });
});

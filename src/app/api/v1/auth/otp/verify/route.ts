import { apiRoute, ok, readJson } from '@/lib/api';
import { confirmRegistrationPhone } from '@/modules/identity/auth-service';
import { otpVerifySchema } from '@/modules/identity/schemas';

export const dynamic = 'force-dynamic';

/** AUTH-03: verifies the registration OTP. Moves REGISTERED → APPROVAL_PENDING (awaiting admin approval). */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const body = await readJson(req, otpVerifySchema);
  const result = await confirmRegistrationPhone(body);
  return ok(requestId, { status: result.status, phoneVerified: true });
});

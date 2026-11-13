import { apiRoute, clientIp, ok, readJson } from '@/lib/api';
import { registerCustomer } from '@/modules/identity/auth-service';
import { registerSchema } from '@/modules/identity/schemas';

export const dynamic = 'force-dynamic';

/** CUSTOMER-001 / AUTH-02: public registration creates a REGISTERED account and sends an OTP. */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const body = await readJson(req, registerSchema);
  const result = await registerCustomer({ ...body, ip: clientIp(req) });
  return ok(
    requestId,
    {
      status: result.status,
      verificationRequired: true,
      otp: { provider: result.otp.provider, ...(result.otp.devCode ? { devCode: result.otp.devCode } : {}) },
    },
    { status: 201 },
  );
});

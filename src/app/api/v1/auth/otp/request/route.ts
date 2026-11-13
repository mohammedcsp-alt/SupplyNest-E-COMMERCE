import { apiRoute, clientIp, ok, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { consumeRateLimit } from '@/lib/rate-limit';
import { normalizeIraqPhone } from '@/modules/identity/phone';
import { issueOtp } from '@/modules/identity/auth-service';
import { otpRequestSchema } from '@/modules/identity/schemas';

export const dynamic = 'force-dynamic';

/**
 * Requests an OTP for registration. Responses have the same shape whether or not the phone exists,
 * so the endpoint cannot be used to enumerate accounts.
 */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const body = await readJson(req, otpRequestSchema);
  await consumeRateLimit({ action: 'otp_request_ip', subject: clientIp(req), limit: 20, windowSeconds: 3600 });
  const phone = normalizeIraqPhone(body.phone);
  if (phone) await consumeRateLimit({ action: 'otp_request_phone', subject: phone, limit: 3, windowSeconds: 3600 });
  const generic = { sent: true, purpose: body.purpose };
  if (!phone || body.purpose !== 'REGISTRATION') return ok(requestId, generic);

  const user = await db.user.findUnique({ where: { phone } });
  if (!user || user.status !== 'REGISTERED') return ok(requestId, generic);

  const delivery = await issueOtp(user.id, phone, 'REGISTRATION');
  return ok(requestId, {
    ...generic,
    provider: delivery.provider,
    ...(delivery.devCode ? { devCode: delivery.devCode } : {}),
  });
});

import { apiRoute, clientIp, ok, readJson } from '@/lib/api';
import { requestRecovery } from '@/modules/identity/auth-service';
import { recoveryRequestSchema } from '@/modules/identity/schemas';

export const dynamic = 'force-dynamic';

/** AUTH-04: access recovery request. Same response for known and unknown phones. */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const body = await readJson(req, recoveryRequestSchema);
  const result = await requestRecovery({ phone: body.phone, ip: clientIp(req) });
  const delivery = result.delivered === false && !('provider' in result) ? null : result;
  return ok(requestId, {
    sent: true,
    ...(delivery && 'devCode' in delivery && delivery.devCode ? { devCode: delivery.devCode, provider: delivery.provider } : {}),
  });
});

import { z } from 'zod';
import { apiRoute, clientIp, ok, readJson } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { createShippingRule } from '@/modules/admin/shipping';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const schema = z.object({
  governorateId: z.string().uuid(),
  areaId: z.string().uuid().nullable().optional(),
  amount: z.string().regex(/^\d{1,12}$/, 'Amount must be a whole IQD number'),
  effectiveFrom: z.string().trim().min(8).max(40),
  effectiveTo: z.string().trim().min(8).max(40).nullable().optional(),
});

function parseInstant(raw: string, field: string): Date {
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const d = new Date(hasZone ? raw : `${raw.length === 10 ? `${raw}T00:00` : raw}+03:00`);
  if (Number.isNaN(d.getTime())) throw errors.validation(`${field} must be a valid date/time`, { fieldErrors: { [field]: ['Invalid date/time'] } });
  return d;
}

/**
 * Creates a new versioned rate. Existing open rules for the same scope are closed (effectiveTo set), never edited.
 * Naive datetimes are read as Asia/Baghdad time (UTC+3).
 */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.SHIPPING_MANAGE);
  const body = await readJson(req, schema);
  const result = await createShippingRule(
    actor.id,
    {
      governorateId: body.governorateId,
      areaId: body.areaId ?? null,
      amount: body.amount,
      effectiveFrom: parseInstant(body.effectiveFrom, 'effectiveFrom'),
      effectiveTo: body.effectiveTo ? parseInstant(body.effectiveTo, 'effectiveTo') : null,
    },
    clientIp(req),
  );
  return ok(requestId, result, { status: 201 });
});

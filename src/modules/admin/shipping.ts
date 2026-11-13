import 'server-only';
import { db, type Tx } from '@/lib/db';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { parseIqdAmount, toApiAmount } from '@/lib/money';
import { HIDDEN_MONEY } from './access';

/** Governorates, areas and shipping rule history. Amounts are entered by administrators only; none are defaulted. */
export async function getShippingAdmin(canPrice: boolean) {
  const [governorates, rules] = await Promise.all([
    db.governorate.findMany({ orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }], include: { areas: { orderBy: { nameEn: 'asc' } } } }),
    db.shippingRateRule.findMany({
      orderBy: [{ effectiveFrom: 'desc' }],
      take: 300,
      include: { governorate: { select: { nameEn: true } }, area: { select: { nameEn: true } } },
    }),
  ]);
  const now = Date.now();
  return {
    governorates: governorates.map((g) => ({
      id: g.id,
      code: g.code,
      nameAr: g.nameAr,
      nameEn: g.nameEn,
      active: g.active,
      sortOrder: g.sortOrder,
      areas: g.areas.map((a) => ({ id: a.id, nameAr: a.nameAr, nameEn: a.nameEn, active: a.active })),
    })),
    rules: rules.map((r) => {
      const from = r.effectiveFrom.getTime();
      const to = r.effectiveTo?.getTime() ?? null;
      const status = !r.active ? 'INACTIVE' : from > now ? 'SCHEDULED' : to === null || to > now ? 'CURRENT' : 'CLOSED';
      return {
        id: r.id,
        governorateId: r.governorateId,
        governorate: r.governorate.nameEn,
        areaId: r.areaId,
        area: r.area?.nameEn ?? null,
        amount: canPrice ? toApiAmount(r.amount) : HIDDEN_MONEY,
        currency: r.currency,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        status,
      };
    }),
  };
}

export async function upsertGovernorate(
  actorId: string,
  input: { id?: string; code: string; nameAr: string; nameEn: string; active?: boolean; sortOrder?: number },
  ip: string | null,
) {
  const code = input.code.trim().toUpperCase();
  const data = { code, nameAr: input.nameAr.trim(), nameEn: input.nameEn.trim(), active: input.active ?? true, sortOrder: input.sortOrder ?? 0 };
  return db.$transaction(async (tx) => {
    if (input.id) {
      const before = await tx.governorate.findUnique({ where: { id: input.id } });
      if (!before) throw errors.notFound('Governorate not found');
      const saved = await tx.governorate.update({ where: { id: input.id }, data });
      await writeAudit(tx, { actorId, action: 'shipping.governorate.update', entityType: 'governorate', entityId: saved.id, before: { nameEn: before.nameEn, active: before.active }, after: data, ip });
      return saved;
    }
    const saved = await tx.governorate.create({ data });
    await writeAudit(tx, { actorId, action: 'shipping.governorate.create', entityType: 'governorate', entityId: saved.id, after: data, ip });
    return saved;
  });
}

export async function upsertArea(
  actorId: string,
  input: { id?: string; governorateId: string; nameAr: string; nameEn: string; active?: boolean },
  ip: string | null,
) {
  const data = { governorateId: input.governorateId, nameAr: input.nameAr.trim(), nameEn: input.nameEn.trim(), active: input.active ?? true };
  return db.$transaction(async (tx) => {
    const gov = await tx.governorate.findUnique({ where: { id: input.governorateId } });
    if (!gov) throw errors.validation('Governorate does not exist');
    if (input.id) {
      const before = await tx.deliveryArea.findUnique({ where: { id: input.id } });
      if (!before) throw errors.notFound('Area not found');
      const saved = await tx.deliveryArea.update({ where: { id: input.id }, data });
      await writeAudit(tx, { actorId, action: 'shipping.area.update', entityType: 'delivery_area', entityId: saved.id, before: { governorateId: before.governorateId, nameEn: before.nameEn }, after: data, ip });
      return saved;
    }
    const saved = await tx.deliveryArea.create({ data });
    await writeAudit(tx, { actorId, action: 'shipping.area.create', entityType: 'delivery_area', entityId: saved.id, after: data, ip });
    return saved;
  });
}

/**
 * Creates a new shipping rate version. Rules are never edited in place: any open rule that starts before the new
 * one is closed by setting its effectiveTo. A rule that starts inside the new window is a conflict.
 */
export async function createShippingRule(
  actorId: string,
  input: { governorateId: string; areaId?: string | null; amount: string; effectiveFrom: Date; effectiveTo?: Date | null },
  ip: string | null,
) {
  const amount = parseIqdAmount(input.amount);
  if (!amount) throw errors.validation('Amount must be a whole IQD number (0 or more)');
  const from = input.effectiveFrom;
  const to = input.effectiveTo ?? null;
  if (to && to.getTime() <= from.getTime()) throw errors.validation('effectiveTo must be after effectiveFrom');
  const areaId = input.areaId ?? null;

  return db.$transaction(async (tx: Tx) => {
    const gov = await tx.governorate.findUnique({ where: { id: input.governorateId } });
    if (!gov) throw errors.validation('Governorate does not exist');
    if (areaId) {
      const area = await tx.deliveryArea.findUnique({ where: { id: areaId } });
      if (!area || area.governorateId !== gov.id) throw errors.validation('Area does not belong to the governorate');
    }
    const candidates = await tx.shippingRateRule.findMany({
      where: {
        governorateId: gov.id,
        areaId,
        active: true,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }],
      },
    });
    const closed: Array<{ id: string; previousEffectiveTo: Date | null }> = [];
    for (const c of candidates) {
      if (c.effectiveFrom.getTime() >= from.getTime()) {
        if (!to || c.effectiveFrom.getTime() < to.getTime()) {
          throw errors.conflict('An existing rule for this scope already starts inside the requested window', { ruleId: c.id });
        }
        continue;
      }
      await tx.shippingRateRule.update({ where: { id: c.id }, data: { effectiveTo: from } });
      closed.push({ id: c.id, previousEffectiveTo: c.effectiveTo });
    }
    const rule = await tx.shippingRateRule.create({
      data: { governorateId: gov.id, areaId, amount, currency: 'IQD', effectiveFrom: from, effectiveTo: to, active: true, createdById: actorId },
    });
    await writeAudit(tx, {
      actorId,
      action: 'shipping.rule.create',
      entityType: 'shipping_rate_rule',
      entityId: rule.id,
      before: { closedRules: closed.map((c) => ({ id: c.id, previousEffectiveTo: c.previousEffectiveTo })) },
      after: { governorateId: gov.id, areaId, amount: amount.toFixed(0), effectiveFrom: from.toISOString(), effectiveTo: to?.toISOString() ?? null },
      ip,
    });
    return { id: rule.id, closedRuleIds: closed.map((c) => c.id) };
  });
}

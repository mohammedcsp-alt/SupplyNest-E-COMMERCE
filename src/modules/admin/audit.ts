import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { parseAdminDateTime } from './time';
import { scrubMoney } from './access';

export type AuditFilters = {
  entityType?: string;
  action?: string;
  actorId?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read-only audit query. Monetary values inside before/after are masked unless the viewer holds price.view. */
export async function listAuditLogs(f: AuditFilters, canPrice: boolean) {
  if (f.actorId && !UUID_RE.test(f.actorId)) throw errors.validation('actorId must be a UUID');
  const from = f.from ? parseAdminDateTime(f.from) : null;
  const to = f.to ? parseAdminDateTime(f.to) : null;
  if (f.from && !from) throw errors.validation('Invalid "from" date');
  if (f.to && !to) throw errors.validation('Invalid "to" date');
  const where: Prisma.AuditLogWhereInput = {
    ...(f.entityType ? { entityType: f.entityType.slice(0, 60) } : {}),
    ...(f.action ? { action: { startsWith: f.action.slice(0, 100) } } : {}),
    ...(f.actorId ? { actorId: f.actorId } : {}),
    ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { occurredAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    db.auditLog.count({ where }),
  ]);
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const actors = actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, phone: true, userType: true } }) : [];
  const actorById = new Map(actors.map((a) => [a.id, a]));
  return {
    total,
    items: rows.map((r) => {
      const priceAction = r.action.startsWith('price.') || r.action.startsWith('import.');
      return {
        id: r.id,
        occurredAt: r.occurredAt,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actorId: r.actorId,
        actorPhone: r.actorId ? actorById.get(r.actorId)?.phone ?? null : null,
        reason: r.reason,
        ip: r.ip,
        before: priceAction && !canPrice ? '[hidden: requires price.view]' : scrubMoney(r.before, canPrice),
        after: priceAction && !canPrice ? '[hidden: requires price.view]' : scrubMoney(r.after, canPrice),
      };
    }),
  };
}

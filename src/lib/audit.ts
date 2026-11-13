import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from './db';

type Db = Pick<typeof db, 'auditLog'>;

export type AuditInput = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
};

/**
 * Appends one audit row. Runs inside the caller's transaction when given one, so a sensitive change and its
 * audit record commit or roll back together. audit_logs rejects UPDATE/DELETE at the database level.
 */
export async function writeAudit(client: Db | Pick<typeof db, 'auditLog'>, input: AuditInput): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
      reason: input.reason ?? null,
      ip: input.ip ?? null,
    },
  });
}

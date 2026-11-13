import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * In-site notifications only (CUSTOMER-008). No WhatsApp, e-mail or SMS notification channels exist in V1.
 * Writes inside the caller's transaction when one is passed.
 */
export async function notify(
  client: Prisma.TransactionClient | typeof db,
  recipientId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await client.notification.create({
    data: { recipientId, type, payload: payload as Prisma.InputJsonValue },
  });
}

export async function listNotifications(userId: string, take = 50) {
  return db.notification.findMany({ where: { recipientId: userId }, orderBy: { createdAt: 'desc' }, take });
}

export async function markRead(userId: string, ids: string[]) {
  await db.notification.updateMany({ where: { recipientId: userId, id: { in: ids }, readAt: null }, data: { readAt: new Date() } });
}

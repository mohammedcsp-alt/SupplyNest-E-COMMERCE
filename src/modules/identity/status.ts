import 'server-only';
import type { AccountStatus, Prisma } from '@prisma/client';

/** Allowed account-status transitions. Anything else is rejected (no silent state jumps). */
const TRANSITIONS: Record<AccountStatus, AccountStatus[]> = {
  REGISTERED: ['APPROVAL_PENDING'],
  APPROVAL_PENDING: ['ACTIVE', 'REJECTED'],
  ACTIVE: ['SUSPENDED'],
  SUSPENDED: ['ACTIVE'],
  REJECTED: [],
};

export function canTransition(from: AccountStatus, to: AccountStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Writes a status history row inside the caller's transaction. */
export async function recordStatusChange(
  tx: Prisma.TransactionClient,
  input: { subjectId: string; from: AccountStatus; to: AccountStatus; reason?: string; actorId?: string | null },
): Promise<void> {
  if (!canTransition(input.from, input.to)) {
    throw new Error(`Illegal account status transition ${input.from} -> ${input.to}`);
  }
  await tx.accountStatusHistory.create({
    data: {
      subjectId: input.subjectId,
      fromStatus: input.from,
      toStatus: input.to,
      reason: input.reason ?? null,
      actorId: input.actorId ?? null,
    },
  });
}

import 'server-only';
import { db } from './db';
import { keyedHash } from './crypto';
import { errors } from './errors';

/**
 * Fixed-window rate limiter backed by security_rate_limits.
 * Atomic upsert: concurrent requests cannot exceed the limit (no read-then-write race).
 * Subjects are keyed-hashed so raw phone numbers / IPs are not persisted.
 */
export async function consumeRateLimit(opts: {
  action: string;
  subject: string;
  limit: number;
  windowSeconds: number;
}): Promise<void> {
  const nowMs = Date.now();
  const windowMs = opts.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(nowMs / windowMs) * windowMs);
  const subjectHash = keyedHash(`rl:${opts.action}`, opts.subject);

  const rows = await db.$queryRaw<{ count: number; blockedUntil: Date | null }[]>`
    INSERT INTO "security_rate_limits" ("id", "subjectHash", "action", "windowStart", "count")
    VALUES (gen_random_uuid(), ${subjectHash}, ${opts.action}, ${windowStart}, 1)
    ON CONFLICT ("subjectHash", "action", "windowStart")
    DO UPDATE SET "count" = "security_rate_limits"."count" + 1
    RETURNING "count", "blockedUntil"
  `;
  const row = rows[0];
  if (row.count > opts.limit) {
    const retryAfter = Math.ceil((windowStart.getTime() + windowMs - nowMs) / 1000);
    throw errors.rateLimited('Too many attempts. Please wait and try again.', retryAfter);
  }
}

/** Reads the current count without consuming (used for UI hints only, never for enforcement). */
export async function peekRateLimit(opts: { action: string; subject: string; windowSeconds: number }): Promise<number> {
  const windowMs = opts.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const subjectHash = keyedHash(`rl:${opts.action}`, opts.subject);
  const row = await db.rateLimitBucket.findUnique({
    where: { subjectHash_action_windowStart: { subjectHash, action: opts.action, windowStart } },
  });
  return row?.count ?? 0;
}

import { errors } from '@/lib/errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rejects malformed ids before they reach Prisma (uuid columns would otherwise fail with a 500). */
export function requireUuid(id: string): string {
  if (!UUID_RE.test(id)) throw errors.notFound('Record not found');
  return id;
}

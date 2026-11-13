import 'server-only';
import type { ReactNode } from 'react';
import { currentLocale, localized, type Locale } from '@/lib/i18n';
import { getCurrentUser, type CurrentUser } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { ForbiddenNotice, LoginRequired } from '@/components/ui';
import { canSeePrices } from '@/modules/admin/access';

export type Gate =
  | { ok: true; locale: Locale; user: CurrentUser; prices: boolean; L: (ar: string, en: string) => string }
  | { ok: false; node: ReactNode };

/**
 * Page-level permission gate. Anonymous visitors see the login prompt; signed-in users without admin.access
 * or the page's specific permission see ForbiddenNotice and no data. Every admin page calls this first.
 */
export async function gatePage(permission: string, nextPath: string): Promise<Gate> {
  const locale = await currentLocale();
  const user = await getCurrentUser();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  if (!user) return { ok: false, node: <LoginRequired locale={locale} next={nextPath} /> };
  const allowed = user.permissions.has(PERMISSIONS.ADMIN_ACCESS) && (!permission || user.permissions.has(permission));
  if (!allowed) return { ok: false, node: <ForbiddenNotice locale={locale} /> };
  return { ok: true, locale, user, prices: canSeePrices(user), L };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Path ids are checked before any query: Prisma rejects non-UUID values for uuid columns (would be a 500). */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Shows a "not found" card with the bilingual message. */
export function NotFoundCard({ message }: { message: string }) {
  return <div className="alert alert-error" role="alert">{message}</div>;
}

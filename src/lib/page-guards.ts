import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentUser, type CurrentUser } from './session';

/** Page-level guard: anonymous visitors go to login with a return path. */
export async function requireSignedIn(nextPath: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

/** Returns the user if they hold the permission; otherwise null (caller renders ForbiddenNotice). */
export async function userWithPermission(permission: string): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has(permission)) return null;
  return user;
}

/** Pages that only make sense for active customers (prices and ordering). */
export async function requireActiveCustomerPage(nextPath: string): Promise<CurrentUser> {
  const user = await requireSignedIn(nextPath);
  if (user.userType !== 'CUSTOMER' || user.status !== 'ACTIVE') return user;
  return user;
}

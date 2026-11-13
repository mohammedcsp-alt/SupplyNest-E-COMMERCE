import 'server-only';
import { cookies } from 'next/headers';
import type { AccountStatus, UserType } from '@prisma/client';
import { db } from './db';
import { config } from './config';
import { newToken, sha256 } from './crypto';
import { errors } from './errors';
import { PERMISSIONS } from './rbac';

export const SESSION_COOKIE = 'b2b_session';

export type CurrentUser = {
  id: string;
  phone: string;
  userType: UserType;
  status: AccountStatus;
  displayName: string;
  priceLevelId: string | null;
  priceLevelCode: string | null;
  permissions: ReadonlySet<string>;
  sessionId: string;
};

/** Customers see prices and may order only when ACTIVE (CUSTOMER-006, T005). */
export function canSeePrices(user: CurrentUser | null): boolean {
  return !!user && user.userType === 'CUSTOMER' && user.status === 'ACTIVE' && !!user.priceLevelId;
}

export function canOrder(user: CurrentUser | null): boolean {
  return canSeePrices(user);
}

export function isStaff(user: CurrentUser | null): boolean {
  return !!user && user.userType === 'STAFF';
}

export function can(user: CurrentUser | null, permission: string): boolean {
  return !!user && user.permissions.has(permission);
}

export function requireUser(user: CurrentUser | null): CurrentUser {
  if (!user) throw errors.unauthorized();
  return user;
}

export function requirePermission(user: CurrentUser | null, permission: string): CurrentUser {
  const u = requireUser(user);
  if (!u.permissions.has(permission)) throw errors.forbidden();
  return u;
}

export function requireActiveCustomer(user: CurrentUser | null): CurrentUser {
  const u = requireUser(user);
  if (u.userType !== 'CUSTOMER') throw errors.forbidden('Customer account required');
  if (u.status !== 'ACTIVE') throw errors.forbidden('Account is not active for ordering');
  return u;
}

export function requireAdminArea(user: CurrentUser | null): CurrentUser {
  return requirePermission(user, PERMISSIONS.ADMIN_ACCESS);
}

/** Loads the session cookie → user with resolved permissions. Returns null when anonymous or expired. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length < 20 || token.length > 200) return null;

  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return null;
  return loadCurrentUserByUserId(session.userId, session.id);
}

const USER_INCLUDE = {
  customerProfile: { include: { priceLevel: true } },
  userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
} as const;

/** Resolves a user with live status, price level and effective permissions (roles → permissions). */
export async function loadCurrentUserByUserId(userId: string, sessionId = 'internal'): Promise<CurrentUser | null> {
  const u = await db.user.findUnique({ where: { id: userId }, include: USER_INCLUDE });
  if (!u) return null;
  const permissions = new Set<string>();
  for (const ur of u.userRoles) for (const rp of ur.role.permissions) permissions.add(rp.permission.code);
  return {
    id: u.id,
    phone: u.phone,
    userType: u.userType,
    status: u.status,
    displayName: u.customerProfile?.displayName ?? u.fullNameEn ?? u.fullNameAr ?? u.phone,
    priceLevelId: u.customerProfile?.currentPriceLevelId ?? null,
    priceLevelCode: u.customerProfile?.priceLevel?.code ?? null,
    permissions,
    sessionId,
  };
}

/** Creates a server-side session row and returns the raw token (only the hash is stored). */
export async function createSession(userId: string, userAgent: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + config.SESSION_HOURS * 3600 * 1000);
  await db.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt, userAgent: userAgent?.slice(0, 255) ?? null },
  });
  return { token, expiresAt };
}

export async function revokeSessionByToken(token: string): Promise<void> {
  await db.session.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const res = await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  return res.count;
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.isProduction,
    path: '/',
    expires: expiresAt,
  };
}

/** Read-model viewer for catalog projections. Null for anonymous visitors. */
export function viewerOf(user: CurrentUser | null): { priceLevelId: string | null; canSeePrices: boolean } | null {
  if (!user) return null;
  return { priceLevelId: user.priceLevelId, canSeePrices: canSeePrices(user) };
}

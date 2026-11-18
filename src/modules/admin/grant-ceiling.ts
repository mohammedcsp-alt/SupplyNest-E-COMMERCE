/**
 * Privilege ceiling for granting roles and permissions (SEC-004).
 *
 * Rules:
 *   1. An administrator may grant only permissions they already hold. A role with permissions the actor lacks cannot
 *      be assigned, and a permission the actor lacks cannot be added to a role.
 *   2. The MANAGER role (all permissions) is reserved for the system owner. Only the owner can assign it or change it.
 *
 * Pure functions: no database access, so the rules are unit tested directly.
 */

export const OWNER_ONLY_ROLE = 'MANAGER';

/** Permission codes the actor would be granting that the actor does not hold. Sorted, unique. */
export function ungrantablePermissions(requested: Iterable<string>, actorPermissions: ReadonlySet<string>): string[] {
  const missing = new Set<string>();
  for (const code of requested) {
    if (!actorPermissions.has(code)) missing.add(code);
  }
  return [...missing].sort();
}

/** Returns a denial reason, or null when the actor may assign these roles. Used by staff creation. */
export function roleAssignmentDenial(input: {
  roleNames: readonly string[];
  roles: ReadonlyArray<{ name: string; permissionCodes: readonly string[] }>;
  actorPermissions: ReadonlySet<string>;
  actorIsOwner: boolean;
}): string | null {
  if (!input.actorIsOwner && input.roleNames.includes(OWNER_ONLY_ROLE)) {
    return 'Only the system owner can assign the MANAGER role.';
  }
  if (input.actorIsOwner) return null; // the owner is the top of the ceiling
  const needed = input.roles.flatMap((r) => r.permissionCodes);
  const missing = ungrantablePermissions(needed, input.actorPermissions);
  if (missing.length) return `You cannot assign permissions you do not hold: ${missing.join(', ')}`;
  return null;
}

/** Returns a denial reason, or null when the actor may change this role's permissions. Used by role editing. */
export function rolePermissionChangeDenial(input: {
  roleName: string;
  addedCodes: readonly string[];
  actorPermissions: ReadonlySet<string>;
  actorIsOwner: boolean;
}): string | null {
  if (!input.actorIsOwner && input.roleName === OWNER_ONLY_ROLE) {
    return 'Only the system owner can change the MANAGER role.';
  }
  if (input.actorIsOwner) return null;
  const missing = ungrantablePermissions(input.addedCodes, input.actorPermissions);
  if (missing.length) return `You cannot grant permissions you do not hold: ${missing.join(', ')}`;
  return null;
}

import { describe, expect, it } from 'vitest';
import { roleAssignmentDenial, rolePermissionChangeDenial, ungrantablePermissions } from '@/modules/admin/grant-ceiling';
import { shouldWriteCredentialSheet, databaseNameOf } from '../../prisma/seed/credential-sheet';

/** SEC-004: privilege ceiling. SEC-005: credential sheet only for the development database. */

const actor = new Set(['role.manage', 'order.view', 'inventory.view']);

describe('ungrantablePermissions', () => {
  it('returns only codes the actor does not hold, sorted and unique', () => {
    expect(ungrantablePermissions(['order.view', 'price.edit', 'price.edit', 'role.manage', 'audit.view'], actor))
      .toEqual(['audit.view', 'price.edit', 'role.manage'].filter((c) => !actor.has(c)).sort());
  });

  it('is empty when the actor holds everything requested', () => {
    expect(ungrantablePermissions(['order.view'], actor)).toEqual([]);
  });
});

describe('roleAssignmentDenial (creating staff)', () => {
  const orderRole = { name: 'ORDER_OPERATOR', permissionCodes: ['order.view'] };
  const priceRole = { name: 'PRICE_EDITOR', permissionCodes: ['order.view', 'price.edit'] };
  const managerRole = { name: 'MANAGER', permissionCodes: ['order.view', 'price.edit', 'role.manage'] };

  it('allows an admin to assign a role whose permissions it already holds', () => {
    expect(roleAssignmentDenial({ roleNames: ['ORDER_OPERATOR'], roles: [orderRole], actorPermissions: actor, actorIsOwner: false })).toBeNull();
  });

  it('denies a non-owner who tries to assign a role carrying permissions it lacks (no escalation)', () => {
    const reason = roleAssignmentDenial({ roleNames: ['PRICE_EDITOR'], roles: [priceRole], actorPermissions: actor, actorIsOwner: false });
    expect(reason).toMatch(/cannot assign permissions you do not hold/);
    expect(reason).toContain('price.edit');
  });

  it('denies a non-owner who tries to assign MANAGER, even if it holds every permission in that role', () => {
    const everything = new Set([...actor, 'order.view', 'price.edit']);
    const reason = roleAssignmentDenial({ roleNames: ['MANAGER'], roles: [managerRole], actorPermissions: everything, actorIsOwner: false });
    expect(reason).toMatch(/Only the system owner can assign the MANAGER role/);
  });

  it('allows the owner to assign MANAGER', () => {
    const everything = new Set(['order.view', 'price.edit', 'role.manage']);
    expect(roleAssignmentDenial({ roleNames: ['MANAGER'], roles: [managerRole], actorPermissions: everything, actorIsOwner: true })).toBeNull();
  });

  it('a mix containing one unassignable role is denied as a whole', () => {
    const reason = roleAssignmentDenial({ roleNames: ['ORDER_OPERATOR', 'PRICE_EDITOR'], roles: [orderRole, priceRole], actorPermissions: actor, actorIsOwner: false });
    expect(reason).not.toBeNull();
  });
});

describe('rolePermissionChangeDenial (editing a role)', () => {
  it('denies adding a permission the actor does not hold', () => {
    expect(rolePermissionChangeDenial({ roleName: 'CUSTOM', addedCodes: ['price.edit'], actorPermissions: actor, actorIsOwner: false }))
      .toMatch(/cannot grant permissions you do not hold: price.edit/);
  });

  it('allows removing permissions and adding ones the actor holds', () => {
    expect(rolePermissionChangeDenial({ roleName: 'CUSTOM', addedCodes: ['order.view'], actorPermissions: actor, actorIsOwner: false })).toBeNull();
    expect(rolePermissionChangeDenial({ roleName: 'CUSTOM', addedCodes: [], actorPermissions: actor, actorIsOwner: false })).toBeNull();
  });

  it('denies a non-owner editing the MANAGER role at all', () => {
    expect(rolePermissionChangeDenial({ roleName: 'MANAGER', addedCodes: [], actorPermissions: actor, actorIsOwner: false }))
      .toMatch(/Only the system owner can change the MANAGER role/);
  });

  it('lets the owner add any permission to a role', () => {
    expect(rolePermissionChangeDenial({ roleName: 'CUSTOM', addedCodes: ['price.edit'], actorPermissions: new Set(), actorIsOwner: true })).toBeNull();
  });
});

describe('credential sheet gate (SEC-005)', () => {
  it('writes only when the target is the development database', () => {
    expect(shouldWriteCredentialSheet('postgresql://u:p@127.0.0.1:5440/b2b_store_dev?schema=public')).toBe(true);
  });

  it('never writes for the automated test database', () => {
    expect(shouldWriteCredentialSheet('postgresql://u:p@127.0.0.1:5440/b2b_store_test?schema=public')).toBe(false);
  });

  it('never writes for any other or missing database', () => {
    expect(shouldWriteCredentialSheet('postgresql://u:p@127.0.0.1:5440/b2b_store_uat?schema=public')).toBe(false);
    expect(shouldWriteCredentialSheet('postgresql://u:p@127.0.0.1:5432/postgres')).toBe(false);
    expect(shouldWriteCredentialSheet(undefined)).toBe(false);
    expect(shouldWriteCredentialSheet('not a url')).toBe(false);
  });

  it('extracts the database name from a URL', () => {
    expect(databaseNameOf('postgresql://u:p@h:1/b2b_store_dev?x=1')).toBe('b2b_store_dev');
    expect(databaseNameOf('postgresql://u:p@h:1/')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { confirmRegistrationPhone, registerCustomer } from '@/modules/identity/auth-service';
import { approveCustomer, updateOwnProfile } from '@/modules/identity/customer-service';
import { listNotifications } from '@/modules/notifications/notify';
import { actorFor, createActiveCustomer, DEV_PASSWORD, freshIp, STAFF, uniquePhone } from '../helpers/fixtures';

describe('customer profile: basic fields editable, legal name locked after approval (CUSTOMER-005)', () => {
  it('display name can change after approval, but the legal (commercial) name cannot once businessIdentityLocked is set', async () => {
    const c = await createActiveCustomer('LEVEL_A');
    const profile = await db.customerProfile.findUniqueOrThrow({ where: { userId: c.userId } });
    expect(profile.businessIdentityLocked).toBe(true);

    const renamed = await updateOwnProfile({ id: c.userId, status: 'ACTIVE' }, { displayName: 'Renamed Trader' });
    expect(renamed.displayName).toBe('Renamed Trader');

    // a commercial name already on file cannot be replaced after approval
    await db.customerProfile.update({ where: { userId: c.userId }, data: { legalName: 'Legal Original Co' } });
    await expect(updateOwnProfile({ id: c.userId, status: 'ACTIVE' }, { legalName: 'Legal Changed Co' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await db.customerProfile.findUniqueOrThrow({ where: { userId: c.userId } })).legalName).toBe('Legal Original Co');

    // and a legal name cannot be newly added after approval either
    const c2 = await createActiveCustomer('LEVEL_B');
    await expect(updateOwnProfile({ id: c2.userId, status: 'ACTIVE' }, { legalName: 'Late Add Co' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await db.customerProfile.findUniqueOrThrow({ where: { userId: c2.userId } })).legalName).toBeNull();
  });
});

describe('in-site notifications only (CUSTOMER-008)', () => {
  it('an approval event creates exactly one in-site notification that listNotifications returns', async () => {
    const phone = uniquePhone();
    const reg = await registerCustomer({ phone, password: DEV_PASSWORD, name: 'Notify Subject', ip: freshIp() });
    if (!reg.otp.devCode) throw new Error('mock OTP did not return a dev code');
    await confirmRegistrationPhone({ phone, code: reg.otp.devCode });
    const user = await db.user.findUniqueOrThrow({ where: { phone } });
    const level = await db.priceLevel.findUniqueOrThrow({ where: { code: 'LEVEL_A' } });
    const before = await db.notification.count({ where: { recipientId: user.id } });

    const manager = await actorFor(STAFF.manager);
    await approveCustomer(manager, { customerId: user.id, priceLevelId: level.id, reason: 'req notify test' });

    expect((await db.notification.count({ where: { recipientId: user.id } })) - before).toBe(1);
    const listed = await listNotifications(user.id);
    const approval = listed.find((n) => n.type === 'account.approved');
    expect(approval).toBeDefined();
    expect(approval!.payload).toEqual({ priceLevel: 'LEVEL_A' });
    expect(approval!.readAt).toBeNull();
  });

  it('the Notification model has no e-mail, SMS or WhatsApp channel fields', () => {
    const model = dmmfModel('Notification');
    const names = model.fields.map((f) => f.name.toLowerCase());
    for (const bad of ['email', 'sms', 'whatsapp', 'channel']) {
      expect(names.some((n) => n.includes(bad))).toBe(false);
    }
  });
});

function dmmfModel(name: string) {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === name);
  if (!m) throw new Error(`model ${name} not in dmmf`);
  return m;
}

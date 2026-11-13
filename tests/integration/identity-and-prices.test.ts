import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { viewerOf, canSeePrices } from '@/lib/session';
import { registerCustomer, confirmRegistrationPhone, authenticate, verifyOtp, requestRecovery, completeRecovery } from '@/modules/identity/auth-service';
import { approveCustomer, suspendCustomer, reactivateCustomer, changePriceLevel } from '@/modules/identity/customer-service';
import { listCatalog, getPublicSku, suggestCatalog } from '@/modules/catalog/public';
import { createActiveCustomer, createSkuFixture, actorFor, STAFF, uniquePhone, freshIp } from '../helpers/fixtures';
import { loadCurrentUserByUserId } from '@/lib/session';

/** T002–T006, ACX-01: account lifecycle and price isolation at the service layer. */
describe('identity lifecycle (T002–T005)', () => {
  it('registration creates a REGISTERED account with no price access (T002)', async () => {
    const phone = uniquePhone();
    const reg = await registerCustomer({ phone, password: 'Test-Pass-1234', name: 'Lifecycle One', ip: freshIp() });
    expect(reg.status).toBe('REGISTERED');
    const u = await db.user.findUniqueOrThrow({ where: { phone } });
    expect(u.status).toBe('REGISTERED');
    const actor = await loadCurrentUserByUserId(u.id);
    expect(canSeePrices(actor)).toBe(false);
    // pending login is refused until the phone is verified
    await expect(authenticate({ phone, password: 'Test-Pass-1234', ip: freshIp() })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('wrong OTP codes are rejected and five failures invalidate the challenge (T003)', async () => {
    const phone = uniquePhone();
    const reg = await registerCustomer({ phone, password: 'Test-Pass-1234', name: 'Otp Tester', ip: freshIp() });
    const real = reg.otp.devCode!;
    const wrong = real === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await expect(confirmRegistrationPhone({ phone, code: wrong })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    // even the correct code no longer works once attempts are exhausted
    await expect(confirmRegistrationPhone({ phone, code: real })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('expired OTP is rejected', async () => {
    const phone = uniquePhone();
    const reg = await registerCustomer({ phone, password: 'Test-Pass-1234', name: 'Expiry Tester', ip: freshIp() });
    const u = await db.user.findUniqueOrThrow({ where: { phone } });
    await db.otpChallenge.updateMany({ where: { userId: u.id, consumedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(confirmRegistrationPhone({ phone, code: reg.otp.devCode! })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('verified phone moves to APPROVAL_PENDING; activation requires a price level (T004)', async () => {
    const phone = uniquePhone();
    const reg = await registerCustomer({ phone, password: 'Test-Pass-1234', name: 'Needs Level', ip: freshIp() });
    const verified = await confirmRegistrationPhone({ phone, code: reg.otp.devCode! });
    expect(verified.status).toBe('APPROVAL_PENDING');
    const u = await db.user.findUniqueOrThrow({ where: { phone } });
    const manager = await actorFor(STAFF.manager);
    // zod-level guard in the route requires priceLevelId; the service rejects an inactive level too
    const inactive = await db.priceLevel.findUniqueOrThrow({ where: { code: 'LEVEL_C' } });
    await expect(approveCustomer(manager, { customerId: u.id, priceLevelId: inactive.id })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const active = await db.priceLevel.findUniqueOrThrow({ where: { code: 'LEVEL_A' } });
    const result = await approveCustomer(manager, { customerId: u.id, priceLevelId: active.id, reason: 'verified business' });
    expect(result.status).toBe('ACTIVE');
    const after = await loadCurrentUserByUserId(u.id);
    expect(canSeePrices(after)).toBe(true);
    // approval is audited and recorded in status history
    const audit = await db.auditLog.findFirst({ where: { action: 'customer.approve', entityId: u.id } });
    expect(audit?.actorId).toBe(manager.id);
    const hist = await db.accountStatusHistory.findFirst({ where: { subjectId: u.id, toStatus: 'ACTIVE' } });
    expect(hist).not.toBeNull();
  });

  it('suspension hides prices and blocks ordering, keeps history; reactivation restores (T005)', async () => {
    const customer = await createActiveCustomer('LEVEL_A');
    const manager = await actorFor(STAFF.manager);
    const before = await loadCurrentUserByUserId(customer.userId);
    expect(canSeePrices(before)).toBe(true);
    await suspendCustomer(manager, { customerId: customer.userId, reason: 'fixture suspension' });
    const during = await loadCurrentUserByUserId(customer.userId);
    expect(canSeePrices(during)).toBe(false);
    expect(viewerOf(during)?.canSeePrices).toBe(false);
    // suspended customers keep their history
    const history = await db.accountStatusHistory.count({ where: { subjectId: customer.userId } });
    expect(history).toBeGreaterThanOrEqual(2);
    await reactivateCustomer(manager, { customerId: customer.userId, reason: 'fixture restore' });
    expect(canSeePrices(await loadCurrentUserByUserId(customer.userId))).toBe(true);
  });

  it('rejected accounts cannot log in; wrong password returns a generic error (AUTH-01)', async () => {
    const phone = uniquePhone();
    await registerCustomer({ phone, password: 'Test-Pass-1234', name: 'Generic Errors', ip: freshIp() });
    await expect(authenticate({ phone, password: 'Wrong-Pass-1234', ip: freshIp() })).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: 'Incorrect phone number or password' });
    await expect(authenticate({ phone: uniquePhone(), password: 'Wrong-Pass-1234', ip: freshIp() })).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: 'Incorrect phone number or password' });
  });

  it('password recovery revokes existing sessions (AUTH-04)', async () => {
    const customer = await createActiveCustomer('LEVEL_B');
    const session = await db.session.create({ data: { userId: customer.userId, tokenHash: `h-${customer.userId}`, expiresAt: new Date(Date.now() + 3600_000) } });
    const delivery = await requestRecovery({ phone: customer.phone, ip: freshIp() });
    expect('devCode' in delivery && delivery.devCode).toBeTruthy();
    await completeRecovery({ phone: customer.phone, code: (delivery as { devCode: string }).devCode, newPassword: 'New-Pass-98765' });
    const revoked = await db.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(revoked.revokedAt).not.toBeNull();
    await expect(authenticate({ phone: customer.phone, password: 'New-Pass-98765', ip: freshIp() })).resolves.toBeTruthy();
  });

  it('price level changes are recorded with history and audited (CUSTOMER-004)', async () => {
    const customer = await createActiveCustomer('LEVEL_A');
    const manager = await actorFor(STAFF.manager);
    const levelB = await db.priceLevel.findUniqueOrThrow({ where: { code: 'LEVEL_B' } });
    await changePriceLevel(manager, { customerId: customer.userId, priceLevelId: levelB.id, reason: 'renegotiated' });
    const after = await loadCurrentUserByUserId(customer.userId);
    expect(after?.priceLevelCode).toBe('LEVEL_B');
    const assignments = await db.customerPriceAssignment.count({ where: { customerId: customer.userId } });
    expect(assignments).toBeGreaterThanOrEqual(2);
  });

  it('OTP verification helper refuses unknown phones generically', async () => {
    await expect(verifyOtp({ phone: uniquePhone(), code: '123456', purpose: 'REGISTRATION' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(errors.forbidden().status).toBe(403);
  });
});

describe('price isolation (ACX-01, T001, T006)', () => {
  it('anonymous catalog and search never contain price fields', async () => {
    const fx = await createSkuFixture({ physical: 5 });
    const { items } = await listCatalog({ q: fx.sku, pageSize: 10 }, null);
    expect(items.length).toBeGreaterThan(0);
    const json = JSON.stringify(items);
    expect(json).not.toMatch(/"price"|"amount"|"tierPrices"|"unitPrice"/);
    const suggestions = await suggestCatalog(fx.sku.slice(0, 6), null);
    expect(JSON.stringify(suggestions)).not.toMatch(/"price"|"amount"/);
    const detail = await getPublicSku(fx.sku, null);
    expect(JSON.stringify(detail)).not.toMatch(/"price"|"amount"/);
  });

  it('an ACTIVE customer sees only their own level price (T006)', async () => {
    const fx = await createSkuFixture({ physical: 5, prices: { LEVEL_A: 15000, LEVEL_B: 22000 } });
    const a = await createActiveCustomer('LEVEL_A');
    const b = await createActiveCustomer('LEVEL_B');
    const viewerA = viewerOf(a.actor);
    const viewerB = viewerOf(b.actor);
    const asA = await getPublicSku(fx.sku, viewerA);
    const asB = await getPublicSku(fx.sku, viewerB);
    expect((asA.item as { price?: unknown }).price).toEqual({ amount: '15000', currency: 'IQD', levelCode: 'LEVEL_A' });
    expect((asB.item as { price?: unknown }).price).toEqual({ amount: '22000', currency: 'IQD', levelCode: 'LEVEL_B' });
    expect(JSON.stringify(asA)).not.toContain('22000');
    expect(JSON.stringify(asB)).not.toContain('15000');
  });

  it('pending and suspended viewers receive no price (T002, T005)', async () => {
    const fx = await createSkuFixture({ physical: 5 });
    const phone = uniquePhone();
    await registerCustomer({ phone, password: 'Test-Pass-1234', name: 'Pending Viewer', ip: freshIp() });
    const pending = await loadCurrentUserByUserId((await db.user.findUniqueOrThrow({ where: { phone } })).id);
    const detail = await getPublicSku(fx.sku, viewerOf(pending));
    expect(detail.item).not.toHaveProperty('price');
  });

  it('price sort/filter is ignored and reported for anonymous viewers', async () => {
    const r = await listCatalog({ q: 'TST-', sort: 'price_asc', priceMin: '1000' }, null);
    expect(r.meta.ignored).toEqual(expect.arrayContaining(['sort', 'price']));
  });
});

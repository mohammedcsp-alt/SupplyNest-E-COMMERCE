import { randomBytes, randomUUID } from 'node:crypto';
import { devPassword } from '../../prisma/seed/dev-secret';
import { db } from '@/lib/db';
import { loadCurrentUserByUserId, type CurrentUser } from '@/lib/session';
import { registerCustomer, confirmRegistrationPhone } from '@/modules/identity/auth-service';
import { approveCustomer } from '@/modules/identity/customer-service';
import { createSku, setTierPrice } from '@/modules/catalog/admin';
import { adjustPhysical } from '@/modules/inventory/inventory';
import { setCartLine } from '@/modules/commerce/cart';
import { buildQuote } from '@/modules/commerce/quote';
import { placeOrder } from '@/modules/commerce/checkout';

/**
 * Test fixtures. Every fixture uses unique identifiers, so tests never depend on a clean database.
 * All data is synthetic. Phone numbers are generated in the Iraqi mobile range, and the database is the test DB.
 */

export const STAFF = {
  manager: '+9647700000001',
  catalog: '+9647700000003',
  inventory: '+9647700000004',
  orders: '+9647700000005',
  picker: '+9647700000006',
  picker2: '+9647700000007',
  checker: '+9647700000008',
  packer: '+9647700000009',
  accountant: '+9647700000010',
  reports: '+9647700000012',
};

export const BAGHDAD_ID = (await db.governorate.findUniqueOrThrow({ where: { code: 'BAGHDAD' } })).id;
export const KIRKUK_ID = (await db.governorate.findUniqueOrThrow({ where: { code: 'KIRKUK' } })).id; // no shipping rule seeded
export const MANSOUR_AREA_ID = '00000000-0000-4000-8000-000000000001';
export const DEV_PASSWORD = devPassword();

let phoneCounter = 0;
export function uniquePhone(): string {
  phoneCounter += 1;
  const digits = String(randomBytes(3).readUIntBE(0, 3) % 1_000_000).padStart(6, '0');
  return `+9647${digits}${String(phoneCounter).padStart(3, '0')}`.slice(0, 14);
}

// Rate-limit buckets persist in the test database, so each process uses its own random IP range.
const IP_BASE = `10.${randomBytes(1).readUInt8(0)}.${randomBytes(1).readUInt8(0)}`;
let ipCounter = 0;
export function freshIp(): string {
  ipCounter += 1;
  return `${IP_BASE}.${(ipCounter % 250) + 1}`;
}

export async function actorFor(phone: string): Promise<CurrentUser> {
  const u = await db.user.findUniqueOrThrow({ where: { phone } });
  const actor = await loadCurrentUserByUserId(u.id);
  if (!actor) throw new Error(`no actor for ${phone}`);
  return actor;
}

/** A registered → verified → approved → ACTIVE customer with a default Baghdad address. */
export async function createActiveCustomer(levelCode: 'LEVEL_A' | 'LEVEL_B' = 'LEVEL_A') {
  const phone = uniquePhone();
  const reg = await registerCustomer({ phone, password: 'Test-Pass-1234', name: `Fixture ${phone.slice(-4)}`, ip: freshIp() });
  const code = reg.otp.devCode;
  if (!code) throw new Error('mock OTP did not return a dev code (test environment misconfigured)');
  await confirmRegistrationPhone({ phone, code });
  const user = await db.user.findUniqueOrThrow({ where: { phone } });
  const level = await db.priceLevel.findUniqueOrThrow({ where: { code: levelCode } });
  const manager = await actorFor(STAFF.manager);
  await approveCustomer(manager, { customerId: user.id, priceLevelId: level.id, reason: 'fixture' });
  const address = await db.address.create({
    data: {
      customerId: user.id,
      governorateId: BAGHDAD_ID,
      areaId: MANSOUR_AREA_ID,
      details: 'Fixture street 1',
      recipientName: 'Fixture',
      recipientPhone: phone,
      isDefault: true,
    },
  });
  return { userId: user.id, phone, addressId: address.id, priceLevelId: level.id, levelCode, actor: await loadCurrentUserByUserId(user.id) as CurrentUser };
}

/** Creates a published SKU with tier prices and an exact physical stock level. */
export async function createSkuFixture(opts: { physical: number; prices?: Partial<Record<'LEVEL_A' | 'LEVEL_B', number>>; published?: boolean }) {
  const manager = await actorFor(STAFF.manager);
  const category = await db.category.findUniqueOrThrow({ where: { slug: 'dev-tshirts' } });
  const code = `TST-${randomUUID().slice(0, 8).toUpperCase()}`;
  const sku = await createSku(manager.id, {
    sku: code,
    categoryId: category.id,
    nameAr: `صنف اختبار ${code}`,
    nameEn: `Test item ${code}`,
    published: opts.published ?? true,
  });
  const prices = { LEVEL_A: 15000, LEVEL_B: 20000, ...(opts.prices ?? {}) };
  for (const [lvl, amount] of Object.entries(prices)) {
    const level = await db.priceLevel.findUniqueOrThrow({ where: { code: lvl } });
    await setTierPrice(manager.id, { skuId: sku.id, priceLevelId: level.id, amount: String(amount), reason: 'fixture price' });
  }
  await db.$transaction((tx) => adjustPhysical(tx, { skuId: sku.id, mode: 'SET', value: opts.physical, reason: 'fixture stock', actorId: manager.id }));
  return { skuId: sku.id, sku: code };
}

/** Adds lines to a customer's cart, computes the quote, and places an order with the quote hash (consent). */
export async function placeTestOrder(customer: Awaited<ReturnType<typeof createActiveCustomer>>, lines: Array<{ sku: string; qty: number }>, key = `key-${randomUUID()}`) {
  for (const l of lines) {
    await setCartLine({ customerId: customer.userId, priceLevelId: customer.priceLevelId, sku: l.sku, qty: l.qty });
  }
  const quote = await db.$transaction((tx) => buildQuote(tx, { customerId: customer.userId, addressId: customer.addressId }));
  return placeOrder({ customerId: customer.userId, idempotencyKey: key, addressId: customer.addressId, quoteHash: quote.quoteHash });
}

export async function skuRow(skuCode: string) {
  return db.sku.findUniqueOrThrow({ where: { sku: skuCode }, include: { inventory: true } });
}

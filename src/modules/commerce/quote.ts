import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { Tx } from '@/lib/db';
import { errors } from '@/lib/errors';
import { getNumberSetting } from '@/lib/settings';
import { toApiAmount, money, type Money } from '@/lib/money';
import { availableOf } from '@/modules/inventory/inventory';

/**
 * Quote engine shared by checkout preview and the order placement transaction (ORD-01, ACX-06).
 * The quote hash is the customer's consent token: the order is accepted only if the freshly recomputed quote
 * matches the hash the customer reviewed. Any change in price, stock line, address or shipping fee changes the hash.
 */

export type QuoteLine = {
  skuId: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  qualityCode: string | null;
  qty: number;
  unitPrice: Money;
  lineTotal: Money;
  availableQty: number;
};

export type QuoteWarning = { code: 'SKU_UNAVAILABLE' | 'NO_PRICE' | 'INSUFFICIENT_STOCK' | 'QTY_LIMIT'; skuId: string; sku: string; message: string };

export type Quote = {
  lines: QuoteLine[];
  warnings: QuoteWarning[];
  blocking: boolean;
  governorateId: string;
  areaId: string | null;
  address: { id: string; label: string | null; governorate: string; area: string | null; details: string; recipientName: string; recipientPhone: string };
  shippingFee: Money;
  subtotal: Money;
  total: Money;
  currency: 'IQD';
  priceLevelCode: string;
  quoteHash: string;
};

/** Resolves the applicable shipping fee: area-specific rule first, then governorate rule. Null when none exists. */
export async function resolveShippingFee(tx: Tx, governorateId: string, areaId: string | null, at: Date = new Date()): Promise<Money | null> {
  const rules = await tx.shippingRateRule.findMany({
    where: {
      active: true,
      governorateId,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      AND: [{ OR: areaId ? [{ areaId }, { areaId: null }] : [{ areaId: null }] }],
    },
    orderBy: [{ effectiveFrom: 'desc' }],
  });
  if (rules.length === 0) return null;
  const areaRule = areaId ? rules.find((r) => r.areaId === areaId) : undefined;
  const rule = areaRule ?? rules.find((r) => r.areaId === null);
  return rule ? money(rule.amount) : null;
}

export function quoteHashOf(input: {
  addressId: string;
  priceLevelCode: string;
  lines: Array<Pick<QuoteLine, 'skuId' | 'qty' | 'unitPrice'>>;
  shippingFee: Money;
  currency: string;
}): string {
  const canonical = JSON.stringify({
    a: input.addressId,
    l: input.priceLevelCode,
    c: input.currency,
    s: input.shippingFee.toFixed(0),
    items: [...input.lines]
      .sort((x, y) => (x.skuId < y.skuId ? -1 : 1))
      .map((l) => [l.skuId, l.qty, l.unitPrice.toFixed(0)]),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** Builds the quote for a customer's current cart. Runs inside the caller's transaction (locks held if any). */
export async function buildQuote(tx: Tx, input: { customerId: string; addressId: string }): Promise<Quote> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: input.customerId }, include: { customerProfile: { include: { priceLevel: true } } } });
  const level = user.customerProfile?.priceLevel;
  if (!level || !user.customerProfile?.currentPriceLevelId) throw errors.forbidden('No price level assigned');

  const address = await tx.address.findFirst({
    where: { id: input.addressId, customerId: input.customerId, deletedAt: null },
    include: { governorate: true, area: true },
  });
  if (!address) throw errors.validation('Select a valid delivery address');

  const maxQty = await getNumberSetting(tx, 'order.maxQtyPerSku', 100);
  const cart = await tx.cart.findUnique({
    where: { customerId: input.customerId },
    include: { items: { include: { sku: { include: { inventory: true, quality: true, tierPrices: { where: { priceLevelId: level.id } } } } }, orderBy: { addedAt: 'asc' } } },
  });

  const warnings: QuoteWarning[] = [];
  const lines: QuoteLine[] = [];
  for (const item of cart?.items ?? []) {
    const s = item.sku;
    if (!s.published || !s.active || s.deletedAt) {
      warnings.push({ code: 'SKU_UNAVAILABLE', skuId: s.id, sku: s.sku, message: 'This item is no longer offered' });
      continue;
    }
    const tp = s.tierPrices[0];
    if (!tp) {
      warnings.push({ code: 'NO_PRICE', skuId: s.id, sku: s.sku, message: 'No price for your price level' });
      continue;
    }
    if (item.qty > maxQty) warnings.push({ code: 'QTY_LIMIT', skuId: s.id, sku: s.sku, message: `Maximum quantity per item is ${maxQty}` });
    const available = s.inventory ? availableOf(s.inventory.physicalOnHand, s.inventory.reservedQty) : 0;
    if (item.qty > available) warnings.push({ code: 'INSUFFICIENT_STOCK', skuId: s.id, sku: s.sku, message: 'Not enough stock for the requested quantity' });
    const unitPrice = money(tp.amount);
    lines.push({
      skuId: s.id,
      sku: s.sku,
      nameAr: s.nameAr,
      nameEn: s.nameEn,
      qualityCode: s.quality?.code ?? null,
      qty: item.qty,
      unitPrice,
      lineTotal: unitPrice.mul(item.qty),
      availableQty: available,
    });
  }

  const shippingFee = await resolveShippingFee(tx, address.governorateId, address.areaId);
  if (shippingFee === null) {
    throw errors.shippingMissing('Shipping is not available to this address yet. Choose another address or contact support.', {
      governorateId: address.governorateId,
      areaId: address.areaId,
    });
  }
  const subtotal = lines.reduce((acc, l) => acc.add(l.lineTotal), new Prisma.Decimal(0));
  const total = subtotal.add(shippingFee);
  const blocking = warnings.length > 0 || lines.length === 0;

  return {
    lines,
    warnings,
    blocking,
    governorateId: address.governorateId,
    areaId: address.areaId,
    address: {
      id: address.id,
      label: address.label,
      governorate: address.governorate.nameEn,
      area: address.area?.nameEn ?? null,
      details: address.details,
      recipientName: address.recipientName,
      recipientPhone: address.recipientPhone,
    },
    shippingFee,
    subtotal,
    total,
    currency: 'IQD',
    priceLevelCode: level.code,
    quoteHash: quoteHashOf({ addressId: address.id, priceLevelCode: level.code, lines, shippingFee, currency: 'IQD' }),
  };
}

/** Serializes a quote for the API. Amounts are integer strings. */
export function presentQuote(q: Quote) {
  return {
    quoteHash: q.quoteHash,
    priceLevelCode: q.priceLevelCode,
    currency: q.currency,
    lines: q.lines.map((l) => ({
      skuId: l.skuId,
      sku: l.sku,
      nameEn: l.nameEn,
      nameAr: l.nameAr,
      qualityCode: l.qualityCode,
      qty: l.qty,
      unitPrice: toApiAmount(l.unitPrice),
      lineTotal: toApiAmount(l.lineTotal),
    })),
    warnings: q.warnings,
    blocking: q.blocking,
    address: q.address,
    shippingFee: toApiAmount(q.shippingFee),
    subtotal: toApiAmount(q.subtotal),
    total: toApiAmount(q.total),
  };
}

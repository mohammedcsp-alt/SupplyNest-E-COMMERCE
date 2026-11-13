import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db, type Tx } from '@/lib/db';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getNumberSetting } from '@/lib/settings';
import { addHours } from '@/lib/time';
import { toApiAmount } from '@/lib/money';
import { reserveLines } from '@/modules/inventory/inventory';
import { notify } from '@/modules/notifications/notify';
import { buildQuote, presentQuote, type Quote } from './quote';
import { ensureFulfillmentJob } from '@/modules/fulfillment/service';

/**
 * Idempotent order placement (ORD-01, CHECKOUT, P03, T024/T025, ACX-02).
 *
 * One database transaction performs: idempotency claim → quote re-validation (price/stock/fee consent check) →
 * stock reservation (row locks, no oversell) → order + item snapshots → event → cart clear → idempotency completion.
 * A duplicate request with the same key replays the stored order; a key reused with different content is rejected.
 */

export type PlaceOrderInput = {
  customerId: string;
  idempotencyKey: string;
  addressId: string;
  quoteHash: string;
  note?: string | null;
  ip?: string | null;
};

function requestHashOf(input: PlaceOrderInput): string {
  return createHash('sha256').update(JSON.stringify({ a: input.addressId, q: input.quoteHash })).digest('hex');
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export async function nextOrderNumber(tx: Tx): Promise<string> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`;
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `ORD-${stamp}-${String(rows[0].n).padStart(6, '0')}`;
}

/** Returns the order for a completed idempotency record, or rejects/409s for mismatches and in-flight requests. */
async function replayOrResolve(existing: { requestHash: string; status: string; orderId: string | null }, requestHash: string) {
  if (existing.requestHash !== requestHash) {
    throw errors.conflict('This Idempotency-Key was already used for a different order request');
  }
  if (existing.status !== 'COMPLETED' || !existing.orderId) {
    throw errors.conflict('An identical order request is still being processed. Wait a moment and retry.');
  }
  const order = await db.order.findUniqueOrThrow({ where: { id: existing.orderId }, include: { items: true } });
  return { order, replayed: true as const };
}

export async function placeOrder(input: PlaceOrderInput) {
  const requestHash = requestHashOf(input);

  const existing = await db.idempotencyRecord.findUnique({ where: { customerId_key: { customerId: input.customerId, key: input.idempotencyKey } } });
  if (existing) return replayOrResolve(existing, requestHash);

  await consumeRateLimit({ action: 'checkout', subject: input.customerId, limit: 10, windowSeconds: 3600 });

  try {
    const result = await db.$transaction(async (tx) => {
      await tx.idempotencyRecord.create({
        data: { customerId: input.customerId, key: input.idempotencyKey, requestHash, status: 'IN_PROGRESS' },
      });

      const quote: Quote = await buildQuote(tx, { customerId: input.customerId, addressId: input.addressId });
      if (quote.quoteHash !== input.quoteHash) {
        throw errors.priceChanged('Prices, stock, or delivery fees changed. Review the updated quote and confirm again.', {
          quote: presentQuote(quote),
        });
      }
      if (quote.blocking) {
        const stock = quote.warnings.some((w) => w.code === 'INSUFFICIENT_STOCK');
        const msg = quote.warnings[0]?.message ?? 'Your cart is empty';
        if (stock) throw errors.stockChanged(msg, { warnings: quote.warnings });
        throw errors.conflict(msg, { warnings: quote.warnings });
      }

      const maxLines = await getNumberSetting(tx, 'order.maxLinesPerOrder', 200);
      if (quote.lines.length > maxLines) throw errors.validation(`An order may have at most ${maxLines} lines`);

      const orderNumber = await nextOrderNumber(tx);
      const order = await tx.order.create({
        data: {
          orderNumber,
          customerId: input.customerId,
          status: 'SUBMITTED',
          subtotal: quote.subtotal,
          shippingFee: quote.shippingFee,
          totalCod: quote.total,
          currency: 'IQD',
          governorateId: quote.governorateId,
          areaId: quote.areaId,
          addressSnapshot: quote.address as unknown as Prisma.InputJsonValue,
          priceLevelCode: quote.priceLevelCode,
          customerNote: input.note ?? null,
          idempotencyKey: input.idempotencyKey,
          version: 1,
          items: {
            create: quote.lines.map((l) => ({
              skuId: l.skuId,
              skuSnapshot: l.sku,
              titleSnapshot: l.nameEn || l.nameAr,
              qualitySnapshot: l.qualityCode,
              qty: l.qty,
              unitPrice: l.unitPrice,
              lineTotal: l.lineTotal,
              priceLevelCode: quote.priceLevelCode,
            })),
          },
        },
      });

      const hours = await getNumberSetting(tx, 'reservation.hours', 24);
      await reserveLines(tx, {
        orderId: order.id,
        lines: quote.lines.map((l) => ({ skuId: l.skuId, qty: l.qty })),
        expiresAt: addHours(new Date(), Math.min(168, Math.max(1, hours))),
        actorId: input.customerId,
      });

      // Preparation queue entry (fulfillment module, temporary/replaceable). Created in the same transaction.
      await ensureFulfillmentJob(tx, order.id);

      await tx.orderEvent.create({
        data: { orderId: order.id, eventType: 'SUBMITTED', fromStatus: null, toStatus: 'SUBMITTED', actorId: input.customerId, metadata: { quoteHash: quote.quoteHash } },
      });
      const cart = await tx.cart.findUnique({ where: { customerId: input.customerId } });
      if (cart) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.idempotencyRecord.update({
        where: { customerId_key: { customerId: input.customerId, key: input.idempotencyKey } },
        data: { status: 'COMPLETED', orderId: order.id },
      });
      await writeAudit(tx, {
        actorId: input.customerId,
        action: 'order.submit',
        entityType: 'order',
        entityId: order.id,
        after: { orderNumber, total: toApiAmount(quote.total), lines: quote.lines.length },
        ip: input.ip ?? null,
      });
      await notify(tx, input.customerId, 'order.submitted', { orderNumber });
      return { order, replayed: false as const };
    });
    return { order: await db.order.findUniqueOrThrow({ where: { id: result.order.id }, include: { items: true } }), replayed: result.replayed };
  } catch (err) {
    if (isUniqueViolation(err)) {
      // A concurrent identical request committed first: return its order (T024).
      const winner = await db.idempotencyRecord.findUnique({ where: { customerId_key: { customerId: input.customerId, key: input.idempotencyKey } } });
      if (winner) return replayOrResolve(winner, requestHash);
    }
    throw err;
  }
}

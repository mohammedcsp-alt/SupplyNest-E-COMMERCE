import 'server-only';
import { Prisma } from '@prisma/client';
import type { Tx } from '@/lib/db';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { money, sumMoney } from '@/lib/money';

/**
 * Shipment and invoice creation at handover, plus invoice revisions for approved adjustments.
 * Called from the fulfillment module inside its handover transaction. Pure accounting rules live in math.ts.
 */

type AcceptedLine = { skuId: string; sku: string; title: string; unitPrice: Prisma.Decimal; qty: number };

export async function nextInvoiceNumber(tx: Tx): Promise<string> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('sales_invoice_seq') AS n`;
  return `INV-${new Date().getUTCFullYear()}-${String(rows[0].n).padStart(6, '0')}`;
}

/** Issues a new invoice revision for an order. The previous revision is kept and marked SUPERSEDED (no silent edits). */
export async function issueInvoiceRevision(
  tx: Tx,
  input: { orderId: string; lines: Array<{ sku: string; title: string; unitPrice: string; qty: number; lineTotal: string }>; goodsTotal: Prisma.Decimal; customerDeliveryFee: Prisma.Decimal; actorId: string | null; reason: string | null },
) {
  const latest = await tx.salesInvoice.findFirst({ where: { orderId: input.orderId }, orderBy: { revision: 'desc' } });
  const revision = (latest?.revision ?? 0) + 1;
  if (latest) await tx.salesInvoice.update({ where: { id: latest.id }, data: { status: 'SUPERSEDED' } });
  const grandTotal = input.goodsTotal.add(input.customerDeliveryFee);
  return tx.salesInvoice.create({
    data: {
      invoiceNumber: latest ? `${latest.invoiceNumber}-R${revision}` : await nextInvoiceNumber(tx),
      orderId: input.orderId,
      revision,
      status: 'ISSUED',
      currency: 'IQD',
      goodsTotal: input.goodsTotal,
      customerDeliveryFee: input.customerDeliveryFee,
      grandTotal,
      lines: input.lines as unknown as Prisma.InputJsonValue,
      reason: input.reason,
      issuedById: input.actorId,
    },
  });
}

/** Creates the courier shipment (with fee snapshots from the effective agreement) and invoice revision 1. */
export async function createShipmentForHandover(
  tx: Tx,
  input: { order: { id: string; shippingFee: Prisma.Decimal; governorateId: string; orderNumber: string }; acceptedLines: AcceptedLine[]; courierId: string; trackingNote: string | null; actorId: string },
) {
  const courier = await tx.courier.findUnique({ where: { id: input.courierId } });
  if (!courier || !courier.active) throw errors.validation('Select an active courier');
  const now = new Date();
  const agreements = await tx.courierAgreement.findMany({
    where: {
      courierId: input.courierId,
      active: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      AND: [{ OR: [{ governorateId: null }, { governorateId: input.order.governorateId }] }],
    },
    orderBy: [{ effectiveFrom: 'desc' }],
  });
  // region-specific agreement wins over a general one
  const agreement = agreements.find((a) => a.governorateId === input.order.governorateId) ?? agreements.find((a) => a.governorateId === null);
  if (!agreement) throw errors.conflict('No active courier agreement covers this courier and governorate. Add an agreement first.');

  const goods = sumMoney(input.acceptedLines.map((l) => money(l.unitPrice).mul(l.qty)));
  const deliveryFee = money(input.order.shippingFee);
  const invoiceLines = input.acceptedLines.filter((l) => l.qty > 0).map((l) => ({
    sku: l.sku,
    title: l.title,
    unitPrice: money(l.unitPrice).toFixed(0),
    qty: l.qty,
    lineTotal: money(l.unitPrice).mul(l.qty).toFixed(0),
  }));
  await issueInvoiceRevision(tx, { orderId: input.order.id, lines: invoiceLines, goodsTotal: goods, customerDeliveryFee: deliveryFee, actorId: input.actorId, reason: 'issued at handover' });

  const shipment = await tx.courierShipment.create({
    data: {
      orderId: input.order.id,
      courierId: input.courierId,
      agreementId: agreement.id,
      settlementModeSnapshot: agreement.settlementMode,
      customerFeeSnapshot: deliveryFee,
      courierFeeSnapshot: agreement.serviceFee,
      codExpectedBase: goods.add(deliveryFee),
      deliveryStatus: 'HANDED_OVER',
      handedOverById: input.actorId,
      trackingNote: input.trackingNote,
    },
  });
  await writeAudit(tx, {
    actorId: input.actorId,
    action: 'shipment.handover',
    entityType: 'courier_shipment',
    entityId: shipment.id,
    after: { courierId: input.courierId, mode: agreement.settlementMode, courierFee: agreement.serviceFee.toFixed(0), codExpectedBase: goods.add(deliveryFee).toFixed(0) },
  });
  return shipment;
}

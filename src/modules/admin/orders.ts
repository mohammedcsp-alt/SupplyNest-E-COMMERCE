import 'server-only';
import { ORDER_STATUSES_LIST } from './constants';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { toApiAmount } from '@/lib/money';
import { HIDDEN_MONEY } from './access';
import { requireUuid } from './ids';

const money = (v: unknown, visible: boolean) => (visible ? toApiAmount(v as never) : HIDDEN_MONEY);

export async function listAdminOrders(input: { status?: string; q?: string; page: number; pageSize: number }, canPrice: boolean) {
  if (input.status && !(ORDER_STATUSES_LIST as readonly string[]).includes(input.status)) throw errors.validation('Unknown order status');
  const q = (input.q ?? '').trim().slice(0, 80);
  const where = {
    ...(input.status ? { status: input.status as (typeof ORDER_STATUSES_LIST)[number] } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q.toUpperCase() } },
            { customer: { phone: { contains: q } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        customer: { select: { phone: true, customerProfile: { select: { displayName: true } } } },
        fulfillmentJob: { select: { id: true, status: true } },
        cancellation: { select: { status: true } },
        _count: { select: { items: true } },
      },
    }),
    db.order.count({ where }),
  ]);
  return {
    total,
    items: rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      customerPhone: o.customer.phone,
      customerName: o.customer.customerProfile?.displayName ?? null,
      submittedAt: o.submittedAt,
      itemCount: o._count.items,
      fulfillmentStatus: o.fulfillmentJob?.status ?? null,
      cancellationStatus: o.cancellation?.status ?? null,
      totalCod: money(o.totalCod, canPrice),
    })),
  };
}

export async function getAdminOrder(orderId: string, canPrice: boolean) {
  requireUuid(orderId);
  const o = await db.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { id: true, phone: true, status: true, customerProfile: { select: { displayName: true } } } },
      items: { orderBy: { createdAt: 'asc' } },
      events: { orderBy: { occurredAt: 'desc' }, take: 200 },
      cancellation: true,
      fulfillmentJob: { select: { id: true, status: true, prepDocumentNo: true } },
      invoices: { orderBy: { issuedAt: 'desc' } },
      shipment: { include: { courier: { select: { name: true } } } },
      reservations: { include: { sku: { select: { sku: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!o) throw errors.notFound('Order not found');
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    version: o.version,
    submittedAt: o.submittedAt,
    fulfillmentLockedAt: o.fulfillmentLockedAt,
    priceLevelCode: o.priceLevelCode,
    customerNote: o.customerNote,
    currency: o.currency,
    subtotal: money(o.subtotal, canPrice),
    shippingFee: money(o.shippingFee, canPrice),
    totalCod: money(o.totalCod, canPrice),
    address: o.addressSnapshot,
    customer: {
      id: o.customer.id,
      phone: o.customer.phone,
      status: o.customer.status,
      displayName: o.customer.customerProfile?.displayName ?? null,
    },
    items: o.items.map((i) => ({
      id: i.id,
      sku: i.skuSnapshot,
      title: i.titleSnapshot,
      quality: i.qualitySnapshot,
      qty: i.qty,
      unitPrice: money(i.unitPrice, canPrice),
      lineTotal: money(i.lineTotal, canPrice),
    })),
    events: o.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actorId: e.actorId,
      reason: e.reason,
      occurredAt: e.occurredAt,
    })),
    cancellation: o.cancellation
      ? {
          status: o.cancellation.status,
          reason: o.cancellation.reason,
          decisionNote: o.cancellation.decisionNote,
          requestedAt: o.cancellation.createdAt,
          decidedAt: o.cancellation.decidedAt,
        }
      : null,
    fulfillmentJob: o.fulfillmentJob,
    invoices: o.invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      revision: i.revision,
      status: i.status,
      grandTotal: money(i.grandTotal, canPrice),
      issuedAt: i.issuedAt,
    })),
    shipment: o.shipment
      ? { courier: o.shipment.courier.name, deliveryStatus: o.shipment.deliveryStatus, handedOverAt: o.shipment.handedOverAt }
      : null,
    reservations: o.reservations.map((r) => ({
      id: r.id,
      sku: r.sku.sku,
      qty: r.qty,
      status: r.status,
      expiresAt: r.expiresAt,
    })),
  };
}

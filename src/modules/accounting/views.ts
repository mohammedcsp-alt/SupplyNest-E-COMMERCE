import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { courierStatement, customerDeliveryFees } from './service';
import { allocatableFor, computeShipmentFinancials, type ShipmentFinancials } from './math';

/**
 * Read-side projections for the accounting screens and the report endpoint. No writes happen here.
 * Every value is an integer IQD string (or null when not yet known). Totals are only sums of separate values.
 */

const SHIPMENT_INCLUDE = {
  order: { select: { id: true, orderNumber: true, status: true, submittedAt: true } },
  courier: { select: { id: true, name: true } },
  adjustments: { orderBy: { createdAt: 'asc' } },
  allocations: {
    orderBy: { createdAt: 'asc' },
    include: { remittance: { select: { id: true, reference: true, receivedAt: true, courierId: true } } },
  },
  financialEvents: { orderBy: { occurredAt: 'asc' } },
} satisfies Prisma.CourierShipmentInclude;

export type ShipmentWithRelations = Prisma.CourierShipmentGetPayload<{ include: typeof SHIPMENT_INCLUDE }>;

/** Date-only inputs mean Asia/Baghdad calendar days (UTC+3, no DST). Returns undefined for empty or invalid input. */
export function rangeDate(v: string | null | undefined, edge: 'start' | 'end'): Date | undefined {
  if (!v) return undefined;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(edge === 'start' ? `${s}T00:00:00.000+03:00` : `${s}T23:59:59.999+03:00`);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Computes every separate financial value of one shipment from its stored snapshots and rows. */
export function financialsOf(s: ShipmentWithRelations): ShipmentFinancials {
  const allocated = s.allocations.reduce((acc, a) => acc.add(a.allocatedAmount), new Prisma.Decimal(0));
  return computeShipmentFinancials({
    mode: s.settlementModeSnapshot,
    goodsTotal: s.codExpectedBase.sub(s.customerFeeSnapshot).toFixed(0),
    customerDeliveryFee: s.customerFeeSnapshot.toFixed(0),
    courierFeeSnapshot: s.courierFeeSnapshot.toFixed(0),
    codCollected: s.codCollected === null ? null : s.codCollected.toFixed(0),
    courierFeeDeducted: s.courierFeeDeducted === null ? null : s.courierFeeDeducted.toFixed(0),
    adjustments: s.adjustments.map((a) => ({ type: a.type, signedAmount: a.signedAmount.toFixed(0) })),
    allocatedToShipment: allocated.toFixed(0),
  });
}

export async function listShipments(opts: { courierId?: string; from?: Date; to?: Date; take?: number } = {}) {
  const rows = await db.courierShipment.findMany({
    where: {
      ...(opts.courierId ? { courierId: opts.courierId } : {}),
      ...(opts.from || opts.to ? { handedOverAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } } : {}),
    },
    orderBy: { handedOverAt: 'desc' },
    take: opts.take ?? 300,
    include: SHIPMENT_INCLUDE,
  });
  return rows.map((s) => ({ shipment: s, f: financialsOf(s) }));
}

export async function shipmentDetail(id: string) {
  const s = await db.courierShipment.findUnique({ where: { id }, include: SHIPMENT_INCLUDE });
  if (!s) return null;
  return { shipment: s, f: financialsOf(s) };
}

/** Shipments of one courier that still have an amount due to allocate against. */
export async function allocationCandidates(courierId: string) {
  const rows = await listShipments({ courierId, take: 500 });
  return rows
    .filter((r) => r.f.courierDue !== null && allocatableFor(r.f) > BigInt(0))
    .map((r) => ({
      shipmentId: r.shipment.id,
      orderNumber: r.shipment.order.orderNumber,
      courierDue: r.f.courierDue ?? '0',
      transfersReceived: r.f.transfersReceived,
      allocatable: allocatableFor(r.f).toString(),
    }));
}

export async function listRemittances() {
  const rows = await db.courierRemittance.findMany({
    orderBy: { receivedAt: 'desc' },
    take: 300,
    include: {
      courier: { select: { id: true, name: true } },
      allocations: { orderBy: { createdAt: 'asc' }, include: { shipment: { select: { id: true, order: { select: { orderNumber: true } } } } } },
    },
  });
  return rows.map((r) => {
    const allocated = r.allocations.reduce((acc, a) => acc.add(a.allocatedAmount), new Prisma.Decimal(0));
    return {
      id: r.id,
      courierId: r.courier.id,
      courier: r.courier.name,
      reference: r.reference,
      method: r.method,
      receivedAt: r.receivedAt,
      note: r.note,
      gross: r.grossAmount.toFixed(0),
      allocated: allocated.toFixed(0),
      unallocated: r.grossAmount.sub(allocated).toFixed(0),
      allocations: r.allocations.map((a) => ({
        id: a.id,
        shipmentId: a.shipment.id,
        orderNumber: a.shipment.order.orderNumber,
        amount: a.allocatedAmount.toFixed(0),
      })),
    };
  });
}

/* ------------------------------------------------------------ reports */

export const REPORT_TYPES = ['couriers', 'customers', 'orders', 'periods'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export type ReportColumn = { key: string; label: { ar: string; en: string }; kind: 'text' | 'money' | 'count' | 'date' };
export type ReportRow = Record<string, string | null>;
export type ReportResult = { type: ReportType; columns: ReportColumn[]; rows: ReportRow[]; totals: ReportRow };

const money = (key: string, ar: string, en: string): ReportColumn => ({ key, label: { ar, en }, kind: 'money' });
const count = (key: string, ar: string, en: string): ReportColumn => ({ key, label: { ar, en }, kind: 'count' });
const text = (key: string, ar: string, en: string): ReportColumn => ({ key, label: { ar, en }, kind: 'text' });
const date = (key: string, ar: string, en: string): ReportColumn => ({ key, label: { ar, en }, kind: 'date' });

export const REPORT_COLUMNS: Record<ReportType, ReportColumn[]> = {
  couriers: [
    text('courier', 'الشركة', 'Courier'),
    count('shipments', 'عدد الشحنات', 'Shipments'),
    money('codExpected', 'COD المتوقع', 'Expected COD'),
    money('codCollected', 'COD المحصّل', 'Collected COD'),
    money('courierDue', 'المستحق من الشركة', 'Courier due'),
    money('courierFeesDeductedFromCod', 'أجور مخصومة من COD (صافي)', 'Fees deducted from COD (NET)'),
    money('courierFeesPayableSeparately', 'أجور تُدفع منفصلاً (إجمالي)', 'Fees payable separately (GROSS)'),
    money('courierFeePayments', 'دفعات الأجور', 'Fee payments'),
    money('courierFeesOutstanding', 'أجور متبقية', 'Fees outstanding'),
    money('transfersReceived', 'التحويلات المستلمة', 'Transfers received'),
    money('merchantOutstanding', 'المتبقي على الشركة', 'Merchant outstanding'),
    money('netPosition', 'المركز الصافي', 'Net position'),
  ],
  customers: [
    text('customerId', 'معرّف العميل', 'Customer ID'),
    count('orders', 'عدد الطلبات', 'Orders'),
    money('customerDeliveryFees', 'رسوم توصيل العميل', 'Customer delivery fees'),
  ],
  orders: [
    text('orderNumber', 'رقم الطلب', 'Order number'),
    text('courier', 'الشركة', 'Courier'),
    text('settlementMode', 'طريقة التسوية', 'Settlement mode'),
    date('handedOverAt', 'تاريخ التسليم للشركة', 'Handed over at'),
    money('orderValue', 'قيمة البضاعة المقبولة', 'Order value (accepted goods)'),
    money('customerDeliveryFee', 'رسوم توصيل العميل', 'Customer delivery fee'),
    money('codExpected', 'COD المتوقع', 'Expected COD'),
    money('codCollected', 'COD المحصّل', 'Collected COD'),
    money('codVariance', 'الفرق', 'COD variance'),
    money('courierFeeSnapshot', 'أجر الشركة (لقطة)', 'Courier fee (snapshot)'),
    money('courierFeeDeducted', 'أجر الشركة المخصوم من COD', 'Courier fee deducted from COD'),
    money('courierFeePayableSeparately', 'أجر يُدفع منفصلاً', 'Courier fee payable separately'),
    money('courierDue', 'المستحق من الشركة', 'Courier due'),
    money('transfersReceived', 'التحويلات المخصصة', 'Transfers received'),
    money('merchantOutstanding', 'المتبقي على الشركة', 'Merchant outstanding'),
    money('expectedSideAdjustments', 'تعديلات COD المتوقع', 'Expected-side adjustments'),
    money('dueSideAdjustments', 'تعديلات المستحق', 'Due-side adjustments'),
  ],
  periods: [
    text('day', 'اليوم (بغداد)', 'Day (Baghdad)'),
    count('shipments', 'عدد الشحنات', 'Shipments'),
    money('orderValue', 'قيمة البضاعة المقبولة', 'Order value (accepted goods)'),
    money('customerDeliveryFee', 'رسوم توصيل العميل', 'Customer delivery fee'),
    money('codExpected', 'COD المتوقع', 'Expected COD'),
    money('codCollected', 'COD المحصّل', 'Collected COD'),
    money('courierDue', 'المستحق من الشركات', 'Courier due'),
    money('transfersReceived', 'التحويلات المخصصة', 'Transfers received'),
    money('merchantOutstanding', 'المتبقي على الشركات', 'Merchant outstanding'),
    money('courierFeesDeductedFromCod', 'أجور مخصومة من COD', 'Fees deducted from COD'),
    money('courierFeesPayableSeparately', 'أجور تُدفع منفصلاً', 'Fees payable separately'),
  ],
};

/** Null-aware integer accumulator: stays null until at least one non-null value is added. */
class Sum {
  private v: bigint | null = null;
  add(x: string | null | undefined) {
    if (x === null || x === undefined || x === '') return;
    this.v = (this.v ?? BigInt(0)) + BigInt(x);
  }
  get(): string | null {
    return this.v === null ? null : this.v.toString();
  }
}

function totalsOf(columns: ReportColumn[], rows: ReportRow[]): ReportRow {
  const out: ReportRow = {};
  for (const c of columns) {
    if (c.kind !== 'money' && c.kind !== 'count') continue;
    const s = new Sum();
    for (const r of rows) s.add(r[c.key]);
    out[c.key] = s.get();
  }
  return out;
}

function finish(type: ReportType, rows: ReportRow[]): ReportResult {
  const columns = REPORT_COLUMNS[type];
  return { type, columns, rows, totals: totalsOf(columns, rows) };
}

type ReportOpts = { from?: Date; to?: Date; courierId?: string; customerId?: string };

export async function buildReport(type: ReportType, opts: ReportOpts): Promise<ReportResult> {
  if (type === 'couriers') {
    const couriers = await db.courier.findMany({ where: opts.courierId ? { id: opts.courierId } : {}, orderBy: { name: 'asc' }, select: { id: true } });
    const rows: ReportRow[] = [];
    for (const c of couriers) {
      const st = await courierStatement(c.id, { from: opts.from, to: opts.to });
      const t = st.totals;
      rows.push({
        courier: st.courier.name,
        shipments: String(st.shipments.length),
        codExpected: t.codExpected,
        codCollected: t.codCollected,
        courierDue: t.courierDue,
        courierFeesDeductedFromCod: t.courierFeesDeductedFromCod,
        courierFeesPayableSeparately: t.courierFeesPayableSeparately,
        courierFeePayments: t.courierFeePayments,
        courierFeesOutstanding: t.courierFeesOutstanding,
        transfersReceived: t.transfersReceived,
        merchantOutstanding: t.merchantOutstanding,
        netPosition: t.netPosition,
      });
    }
    return finish(type, rows);
  }

  if (type === 'customers') {
    const { rows: orderRows } = await customerDeliveryFees({ customerId: opts.customerId, from: opts.from, to: opts.to });
    const groups = new Map<string, { orders: number; fees: Sum }>();
    for (const r of orderRows) {
      const g = groups.get(r.customerId) ?? { orders: 0, fees: new Sum() };
      g.orders += 1;
      g.fees.add(r.deliveryFee);
      groups.set(r.customerId, g);
    }
    const rows: ReportRow[] = [...groups.entries()].map(([customerId, g]) => ({
      customerId,
      orders: String(g.orders),
      customerDeliveryFees: g.fees.get(),
    }));
    return finish(type, rows);
  }

  const shipments = await listShipments({ courierId: opts.courierId, from: opts.from, to: opts.to, take: 5000 });

  if (type === 'orders') {
    const rows: ReportRow[] = shipments.map(({ shipment: s, f }) => ({
      orderNumber: s.order.orderNumber,
      courier: s.courier.name,
      settlementMode: s.settlementModeSnapshot,
      handedOverAt: s.handedOverAt.toISOString(),
      orderValue: f.orderValue,
      customerDeliveryFee: f.customerDeliveryFee,
      codExpected: f.codExpected,
      codCollected: f.codCollected,
      codVariance: f.codVariance,
      courierFeeSnapshot: f.courierFeeSnapshot,
      courierFeeDeducted: f.courierFeeDeducted,
      courierFeePayableSeparately: f.courierFeePayableSeparately,
      courierDue: f.courierDue,
      transfersReceived: f.transfersReceived,
      merchantOutstanding: f.merchantOutstanding,
      expectedSideAdjustments: f.expectedSideAdjustments,
      dueSideAdjustments: f.dueSideAdjustments,
    }));
    return finish(type, rows);
  }

  // periods: grouped by the Baghdad calendar day of handover
  const byDay = new Map<string, { n: number; orderValue: Sum; fee: Sum; expected: Sum; collected: Sum; due: Sum; transfers: Sum; outstanding: Sum; deducted: Sum; payable: Sum }>();
  for (const { shipment: s, f } of shipments) {
    const day = new Date(s.handedOverAt.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
    let g = byDay.get(day);
    if (!g) {
      g = { n: 0, orderValue: new Sum(), fee: new Sum(), expected: new Sum(), collected: new Sum(), due: new Sum(), transfers: new Sum(), outstanding: new Sum(), deducted: new Sum(), payable: new Sum() };
      byDay.set(day, g);
    }
    g.n += 1;
    g.orderValue.add(f.orderValue);
    g.fee.add(f.customerDeliveryFee);
    g.expected.add(f.codExpected);
    g.collected.add(f.codCollected);
    g.due.add(f.courierDue);
    g.transfers.add(f.transfersReceived);
    g.outstanding.add(f.merchantOutstanding);
    g.deducted.add(f.courierFeeDeducted);
    g.payable.add(f.courierFeePayableSeparately);
  }
  const rows: ReportRow[] = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, g]) => ({
      day,
      shipments: String(g.n),
      orderValue: g.orderValue.get(),
      customerDeliveryFee: g.fee.get(),
      codExpected: g.expected.get(),
      codCollected: g.collected.get(),
      courierDue: g.due.get(),
      transfersReceived: g.transfers.get(),
      merchantOutstanding: g.outstanding.get(),
      courierFeesDeductedFromCod: g.deducted.get(),
      courierFeesPayableSeparately: g.payable.get(),
    }));
  return finish(type, rows);
}

/** Customer delivery charges for the customers screen, with totals kept apart from courier fees. */
export async function customerFeesView(opts: { from?: Date; to?: Date }) {
  const { rows, total } = await customerDeliveryFees(opts);
  const ids = [...new Set(rows.map((r) => r.customerId))];
  const users = ids.length
    ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, phone: true, fullNameEn: true, fullNameAr: true, customerProfile: { select: { displayName: true } } } })
    : [];
  const names = new Map(users.map((u) => [u.id, u.customerProfile?.displayName ?? u.fullNameEn ?? u.fullNameAr ?? u.phone]));
  return {
    total,
    rows: rows.map((r) => ({ ...r, customerName: names.get(r.customerId) ?? r.customerId })),
  };
}

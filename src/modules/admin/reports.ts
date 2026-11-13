import 'server-only';
import { createHash } from 'node:crypto';
import type { AccountStatus, OrderStatus, ReservationStatus, ImportStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { toApiAmount } from '@/lib/money';
import { ORDER_STATUSES_LIST, ACCOUNT_STATUSES_LIST, RESERVATION_STATUSES_LIST, IMPORT_STATUSES_LIST, REPORT_TYPES_LIST } from './constants';
import { parseAdminDateTime, startOfBaghdadDay } from './time';

/**
 * Report engine (ADM-REP). One query per type feeds three outputs: JSON preview, XLSX and CSV exports,
 * and the printable page. Money columns are included only when the viewer holds price.view.
 */

export const REPORT_MAX_ROWS = 10000;
export type ReportType = (typeof REPORT_TYPES_LIST)[number];
export const REPORT_TYPE_LABELS: Record<ReportType, { ar: string; en: string }> = {
  orders: { ar: 'الطلبات', en: 'Orders' },
  customers: { ar: 'العملاء', en: 'Customers' },
  products: { ar: 'المنتجات', en: 'Products (SKUs)' },
  inventory: { ar: 'المخزون', en: 'Inventory' },
  imports: { ar: 'عمليات الاستيراد', en: 'Imports' },
  prices: { ar: 'تغييرات الأسعار (سجل)', en: 'Price change history' },
  reservations: { ar: 'الحجوزات', en: 'Reservations' },
  shipping: { ar: 'قواعد الشحن', en: 'Shipping rules' },
};

export type ReportFilters = {
  from?: string;
  to?: string;
  status?: string;
  customerId?: string;
  skuId?: string;
  priceLevelId?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseReportType(raw: string): ReportType {
  if (!(REPORT_TYPES_LIST as readonly string[]).includes(raw)) throw errors.notFound('Unknown report type');
  return raw as ReportType;
}

export function parseReportFilters(sp: URLSearchParams): ReportFilters {
  const f: ReportFilters = {};
  for (const key of ['from', 'to'] as const) {
    const v = (sp.get(key) ?? '').trim();
    if (!v) continue;
    if (!DATE_RE.test(v) || !parseAdminDateTime(v)) throw errors.validation(`${key} must be a YYYY-MM-DD date`);
    f[key] = v;
  }
  if (f.from && f.to && f.to < f.from) throw errors.validation('"to" must be on or after "from"');
  const status = (sp.get('status') ?? '').trim();
  if (status) {
    if (status.length > 40 || !/^[A-Z_]+$/.test(status)) throw errors.validation('Invalid status filter');
    f.status = status;
  }
  for (const key of ['customerId', 'skuId', 'priceLevelId'] as const) {
    const v = (sp.get(key) ?? '').trim();
    if (!v) continue;
    if (!UUID_RE.test(v)) throw errors.validation(`${key} must be a UUID`);
    f[key] = v;
  }
  return f;
}

/** Serializes filters into a query string (same filters for preview, export and print). */
export function filtersToSearch(type: ReportType, f: ReportFilters, extra?: Record<string, string>): string {
  const sp = new URLSearchParams({ type, ...(extra ?? {}) });
  for (const [k, v] of Object.entries(f)) if (v) sp.set(k, v);
  return sp.toString();
}

type Cell = string | number | boolean | null;
export type ReportColumn = { key: string; labelEn: string; labelAr: string };
export type ReportResult = {
  type: ReportType;
  columns: ReportColumn[];
  rows: Array<Record<string, Cell>>;
  rowCount: number;
  truncated: boolean;
};

function rangeOf(f: ReportFilters): { gte?: Date; lt?: Date } {
  const out: { gte?: Date; lt?: Date } = {};
  if (f.from) out.gte = startOfBaghdadDay(parseAdminDateTime(f.from)!);
  if (f.to) out.lt = new Date(startOfBaghdadDay(parseAdminDateTime(f.to)!).getTime() + 24 * 3600 * 1000);
  return out;
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
type ColDef = [string, string, string];
const cols = (defs: Array<ColDef | ReportColumn>): ReportColumn[] =>
  defs.map((d) => (Array.isArray(d) ? { key: d[0], labelEn: d[1], labelAr: d[2] } : d));

export async function buildReport(type: ReportType, f: ReportFilters, canPrice: boolean): Promise<ReportResult> {
  if (type === 'prices' && !canPrice) throw errors.forbidden('Price reports require price.view');
  const take = REPORT_MAX_ROWS + 1;
  const range = rangeOf(f);
  let columns: ReportResult['columns'];
  let rows: Array<Record<string, Cell>>;

  if (type === 'orders') {
    if (f.status && !(ORDER_STATUSES_LIST as readonly string[]).includes(f.status)) throw errors.validation('Unknown order status');
    let priceLevelCode: string | undefined;
    if (f.priceLevelId) priceLevelCode = (await db.priceLevel.findUnique({ where: { id: f.priceLevelId }, select: { code: true } }))?.code ?? '__none__';
    const data = await db.order.findMany({
      where: {
        ...(range.gte || range.lt ? { submittedAt: range } : {}),
        ...(f.status ? { status: f.status as OrderStatus } : {}),
        ...(f.customerId ? { customerId: f.customerId } : {}),
        ...(f.skuId ? { items: { some: { skuId: f.skuId } } } : {}),
        ...(priceLevelCode ? { priceLevelCode } : {}),
      },
      orderBy: { submittedAt: 'desc' },
      take,
      include: { customer: { select: { phone: true } }, fulfillmentJob: { select: { status: true } }, _count: { select: { items: true } } },
    });
    columns = cols([
      ['orderNumber', 'Order no.', 'رقم الطلب'],
      ['submittedAt', 'Submitted (UTC)', 'تاريخ الإرسال'],
      ['customerPhone', 'Customer phone', 'هاتف العميل'],
      ['status', 'Status', 'الحالة'],
      ['fulfillmentStatus', 'Fulfillment', 'حالة التجهيز'],
      ['itemCount', 'Lines', 'عدد البنود'],
      ...(canPrice ? cols([['subtotal', 'Subtotal (IQD)', 'المجموع الفرعي'], ['shippingFee', 'Shipping (IQD)', 'الشحن'], ['totalCod', 'Total COD (IQD)', 'إجمالي الدفع']]) : []),
    ]);
    rows = data.map((o) => ({
      orderNumber: o.orderNumber,
      submittedAt: iso(o.submittedAt),
      customerPhone: o.customer.phone,
      status: o.status,
      fulfillmentStatus: o.fulfillmentJob?.status ?? null,
      itemCount: o._count.items,
      ...(canPrice ? { subtotal: toApiAmount(o.subtotal), shippingFee: toApiAmount(o.shippingFee), totalCod: toApiAmount(o.totalCod) } : {}),
    }));
  } else if (type === 'customers') {
    if (f.status && !(ACCOUNT_STATUSES_LIST as readonly string[]).includes(f.status)) throw errors.validation('Unknown account status');
    const data = await db.user.findMany({
      where: {
        userType: 'CUSTOMER',
        ...(range.gte || range.lt ? { createdAt: range } : {}),
        ...(f.status ? { status: f.status as AccountStatus } : {}),
        ...(f.customerId ? { id: f.customerId } : {}),
        ...(f.priceLevelId ? { customerProfile: { currentPriceLevelId: f.priceLevelId } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: { customerProfile: { include: { priceLevel: { select: { code: true } } } } },
    });
    columns = cols([
      ['phone', 'Phone', 'الهاتف'],
      ['displayName', 'Display name', 'الاسم'],
      ['status', 'Status', 'الحالة'],
      ['priceLevelCode', 'Price level', 'مستوى السعر'],
      ['phoneVerifiedAt', 'Phone verified', 'تاريخ التحقق'],
      ['createdAt', 'Registered', 'تاريخ التسجيل'],
    ]);
    rows = data.map((u) => ({
      phone: u.phone,
      displayName: u.customerProfile?.displayName ?? null,
      status: u.status,
      priceLevelCode: u.customerProfile?.priceLevel?.code ?? null,
      phoneVerifiedAt: iso(u.phoneVerifiedAt),
      createdAt: iso(u.createdAt),
    }));
  } else if (type === 'products') {
    const data = await db.sku.findMany({
      where: {
        deletedAt: null,
        ...(f.skuId ? { id: f.skuId } : {}),
        ...(f.status === 'PUBLISHED' ? { published: true } : f.status === 'UNPUBLISHED' ? { published: false } : {}),
      },
      orderBy: { sku: 'asc' },
      take,
      include: {
        category: { select: { nameEn: true } },
        brand: { select: { name: true } },
        quality: { select: { code: true } },
        tierPrices: { include: { priceLevel: { select: { id: true, code: true } } }, where: f.priceLevelId ? { priceLevelId: f.priceLevelId } : undefined },
      },
    });
    columns = cols([
      ['sku', 'SKU', 'رمز SKU'],
      ['nameEn', 'Name (EN)', 'الاسم (EN)'],
      ['category', 'Category', 'الفئة'],
      ['brand', 'Brand', 'العلامة'],
      ['quality', 'Quality', 'الجودة'],
      ['published', 'Published', 'منشور'],
      ['active', 'Active', 'فعال'],
      ...(canPrice ? cols([['prices', 'Tier prices (IQD)', 'الأسعار حسب المستوى']]) : []),
    ]);
    rows = data.map((s) => ({
      sku: s.sku,
      nameEn: s.nameEn,
      category: s.category.nameEn,
      brand: s.brand?.name ?? null,
      quality: s.quality?.code ?? null,
      published: s.published,
      active: s.active,
      ...(canPrice ? { prices: s.tierPrices.map((t) => `${t.priceLevel.code}=${toApiAmount(t.amount)}`).join('; ') } : {}),
    }));
  } else if (type === 'inventory') {
    const data = await db.sku.findMany({
      where: {
        deletedAt: null,
        ...(f.skuId ? { id: f.skuId } : {}),
        ...(f.status === 'LOW_STOCK' ? { alerts: { some: { state: 'OPEN', alertType: 'LOW_STOCK' } } } : {}),
      },
      orderBy: { sku: 'asc' },
      take,
      include: { inventory: true, alerts: { where: { state: 'OPEN' }, select: { alertType: true } } },
    });
    columns = cols([
      ['sku', 'SKU', 'رمز SKU'],
      ['nameEn', 'Name (EN)', 'الاسم (EN)'],
      ['physicalOnHand', 'Physical', 'الفعلي'],
      ['reservedQty', 'Reserved', 'محجوز'],
      ['availableQty', 'Available', 'المتاح'],
      ['conflict', 'Conflict', 'تعارض'],
      ['sourceTimestamp', 'Source timestamp', 'تاريخ المصدر'],
      ['openAlerts', 'Open alerts', 'تنبيهات مفتوحة'],
    ]);
    rows = data.map((s) => {
      const phys = s.inventory?.physicalOnHand ?? 0;
      const res = s.inventory?.reservedQty ?? 0;
      return {
        sku: s.sku,
        nameEn: s.nameEn,
        physicalOnHand: phys,
        reservedQty: res,
        availableQty: Math.max(0, phys - res),
        conflict: res > phys,
        sourceTimestamp: iso(s.inventory?.sourceTimestamp),
        openAlerts: s.alerts.map((a) => a.alertType).join(', ') || null,
      };
    });
  } else if (type === 'imports') {
    if (f.status && !(IMPORT_STATUSES_LIST as readonly string[]).includes(f.status)) throw errors.validation('Unknown import status');
    const data = await db.importBatch.findMany({
      where: {
        ...(range.gte || range.lt ? { createdAt: range } : {}),
        ...(f.status ? { status: f.status as ImportStatus } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: { _count: { select: { errors: true } } },
    });
    columns = cols([
      ['id', 'Import ID', 'معرّف الاستيراد'],
      ['type', 'Type', 'النوع'],
      ['filename', 'File', 'الملف'],
      ['status', 'Status', 'الحالة'],
      ['freshness', 'Freshness', 'الحداثة'],
      ['errorCount', 'Row errors', 'أخطاء الصفوف'],
      ['createdAt', 'Created', 'تاريخ الإنشاء'],
      ['committedAt', 'Committed', 'تاريخ الاعتماد'],
    ]);
    rows = data.map((b) => ({
      id: b.id,
      type: b.type,
      filename: b.filename,
      status: b.status,
      freshness: b.freshness,
      errorCount: b._count.errors,
      createdAt: iso(b.createdAt),
      committedAt: iso(b.committedAt),
    }));
  } else if (type === 'prices') {
    const data = await db.priceChangeHistory.findMany({
      where: {
        ...(range.gte || range.lt ? { occurredAt: range } : {}),
        ...(f.skuId ? { skuId: f.skuId } : {}),
        ...(f.priceLevelId ? { priceLevelId: f.priceLevelId } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take,
      include: { sku: { select: { sku: true } }, priceLevel: { select: { code: true } } },
    });
    columns = cols([
      ['occurredAt', 'Changed at', 'تاريخ التغيير'],
      ['sku', 'SKU', 'رمز SKU'],
      ['priceLevel', 'Price level', 'مستوى السعر'],
      ['oldAmount', 'Old (IQD)', 'القديم'],
      ['newAmount', 'New (IQD)', 'الجديد'],
      ['source', 'Source', 'المصدر'],
      ['actorId', 'Actor ID', 'معرّف المنفذ'],
    ]);
    rows = data.map((p) => ({
      occurredAt: iso(p.occurredAt),
      sku: p.sku.sku,
      priceLevel: p.priceLevel.code,
      oldAmount: toApiAmount(p.oldAmount),
      newAmount: toApiAmount(p.newAmount),
      source: p.source,
      actorId: p.actorId,
    }));
  } else if (type === 'reservations') {
    if (f.status && !(RESERVATION_STATUSES_LIST as readonly string[]).includes(f.status)) throw errors.validation('Unknown reservation status');
    const data = await db.inventoryReservation.findMany({
      where: {
        ...(range.gte || range.lt ? { createdAt: range } : {}),
        ...(f.status ? { status: f.status as ReservationStatus } : {}),
        ...(f.skuId ? { skuId: f.skuId } : {}),
        ...(f.customerId ? { order: { customerId: f.customerId } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: { order: { select: { orderNumber: true } }, sku: { select: { sku: true } } },
    });
    columns = cols([
      ['orderNumber', 'Order no.', 'رقم الطلب'],
      ['sku', 'SKU', 'رمز SKU'],
      ['qty', 'Qty', 'الكمية'],
      ['status', 'Status', 'الحالة'],
      ['expiresAt', 'Expires', 'ينتهي'],
      ['releasedAt', 'Released', 'أفرج عنه'],
      ['consumedAt', 'Consumed', 'استهلك'],
      ['createdAt', 'Created', 'تاريخ الإنشاء'],
    ]);
    rows = data.map((r) => ({
      orderNumber: r.order.orderNumber,
      sku: r.sku.sku,
      qty: r.qty,
      status: r.status,
      expiresAt: iso(r.expiresAt),
      releasedAt: iso(r.releasedAt),
      consumedAt: iso(r.consumedAt),
      createdAt: iso(r.createdAt),
    }));
  } else {
    // shipping
    const data = await db.shippingRateRule.findMany({
      where: {
        ...(range.gte || range.lt ? { effectiveFrom: range } : {}),
        ...(f.status === 'ACTIVE' ? { active: true } : f.status === 'INACTIVE' ? { active: false } : {}),
      },
      orderBy: [{ effectiveFrom: 'desc' }],
      take,
      include: { governorate: { select: { nameEn: true } }, area: { select: { nameEn: true } } },
    });
    columns = cols([
      ['governorate', 'Governorate', 'المحافظة'],
      ['area', 'Area', 'المنطقة'],
      ...(canPrice ? cols([['amount', 'Amount (IQD)', 'المبلغ']]) : []),
      ['effectiveFrom', 'Effective from', 'ساري من'],
      ['effectiveTo', 'Effective to', 'ساري حتى'],
      ['active', 'Active', 'فعال'],
    ]);
    rows = data.map((r) => ({
      governorate: r.governorate.nameEn,
      area: r.area?.nameEn ?? null,
      ...(canPrice ? { amount: toApiAmount(r.amount) } : {}),
      effectiveFrom: iso(r.effectiveFrom),
      effectiveTo: iso(r.effectiveTo),
      active: r.active,
    }));
  }

  const truncated = rows.length > REPORT_MAX_ROWS;
  const kept = truncated ? rows.slice(0, REPORT_MAX_ROWS) : rows;
  return { type, columns, rows: kept, rowCount: kept.length, truncated };
}

/** Cells starting with = + - @ are prefixed so spreadsheet apps cannot evaluate them (CSV injection). */
function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(result: ReportResult): Buffer {
  const header = result.columns.map((c) => csvCell(c.labelEn)).join(',');
  const body = result.rows.map((r) => result.columns.map((c) => csvCell(r[c.key] ?? null)).join(','));
  return Buffer.from(`﻿${[header, ...body].join('\r\n')}\r\n`, 'utf8');
}

export async function toXlsx(result: ReportResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'B2B-STORE admin';
  wb.created = new Date();
  const ws = wb.addWorksheet(result.type.slice(0, 31));
  ws.columns = result.columns.map((c) => ({ header: c.labelEn, key: c.key, width: 22 }));
  ws.getRow(1).font = { bold: true };
  for (const r of result.rows) {
    ws.addRow(Object.fromEntries(result.columns.map((c) => [c.key, r[c.key] ?? null])));
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

export function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}


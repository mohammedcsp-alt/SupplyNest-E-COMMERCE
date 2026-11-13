import 'server-only';
import { db, type Tx } from '@/lib/db';
import { errors } from '@/lib/errors';
import { getNumberSetting } from '@/lib/settings';
import { toApiAmount } from '@/lib/money';
import { availableOf } from '@/modules/inventory/inventory';
import { parseTable, missingColumns, CUSTOMER_ORDER_COLUMNS, type TableRow } from '@/modules/imports/table';

/**
 * Cart and bulk ordering helpers (CUS-06, CUS-07, CUS-08, P05, P06, IMP-02).
 * Nothing here creates an order or a reservation. Bulk input is previewed and returned for review.
 */

export async function getCart(customerId: string, priceLevelId: string, priceLevelCode: string) {
  const cart = await db.cart.findUnique({
    where: { customerId },
    include: {
      items: {
        orderBy: { addedAt: 'asc' },
        include: {
          sku: {
            include: {
              inventory: true,
              quality: true,
              tierPrices: { where: { priceLevelId } },
              images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { id: true } },
            },
          },
        },
      },
    },
  });
  const items = (cart?.items ?? []).map((it) => {
    const s = it.sku;
    const offered = s.published && s.active && !s.deletedAt;
    const price = s.tierPrices[0];
    const avail = s.inventory ? availableOf(s.inventory.physicalOnHand, s.inventory.reservedQty) : 0;
    return {
      skuId: s.id,
      sku: s.sku,
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      qualityCode: s.quality?.code ?? null,
      image: s.images[0] ? `/api/v1/media/${s.images[0].id}` : null,
      qty: it.qty,
      unitPrice: price ? toApiAmount(price.amount) : null,
      lineTotal: price ? toApiAmount(price.amount.mul(it.qty)) : null,
      priceLevelCode,
      availability: offered && avail > 0 ? 'AVAILABLE' : 'UNAVAILABLE',
      orderable: offered && !!price && avail >= it.qty,
    };
  });
  return { items, count: items.length };
}

/** Sets a line quantity. qty 0 removes the line. The SKU must be offered and have a price for the customer. */
export async function setCartLine(input: { customerId: string; priceLevelId: string | null; sku: string; qty: number }) {
  const max = await getNumberSetting(db, 'order.maxQtyPerSku', 100);
  if (!Number.isInteger(input.qty) || input.qty < 0 || input.qty > max) throw errors.validation(`Quantity must be 0–${max}`);
  return db.$transaction(async (tx) => {
    const s = await tx.sku.findUnique({ where: { sku: input.sku.toUpperCase() }, include: { inventory: true } });
    const cart = await tx.cart.upsert({ where: { customerId: input.customerId }, update: {}, create: { customerId: input.customerId } });
    if (input.qty === 0) {
      await tx.cartItem.deleteMany({ where: { cartId: cart.id, skuId: s?.id ?? '' } });
      return { removed: true };
    }
    if (!s || !s.published || !s.active || s.deletedAt) throw errors.notFound('Item not found');
    if (input.priceLevelId) {
      const price = await tx.tierPrice.findUnique({ where: { skuId_priceLevelId: { skuId: s.id, priceLevelId: input.priceLevelId } } });
      if (!price) throw errors.conflict('This item has no price for your account');
    }
    await tx.cartItem.upsert({
      where: { cartId_skuId: { cartId: cart.id, skuId: s.id } },
      update: { qty: input.qty },
      create: { cartId: cart.id, skuId: s.id, qty: input.qty },
    });
    const avail = s.inventory ? availableOf(s.inventory.physicalOnHand, s.inventory.reservedQty) : 0;
    return { removed: false, sku: s.sku, qty: input.qty, availableNow: avail >= input.qty };
  });
}

export type BulkRowIssue = { rowNumber: number; input: string; code: string; message: string };
export type BulkLine = { sku: string; skuId: string; nameEn: string; qty: number; sourceRows: number[] };

/**
 * Parses pasted "SKU qty" lines (tab, comma, semicolon or space separated) or an uploaded CSV/XLSX with SKU,QTY.
 * Duplicate SKUs are merged by summing quantities, with the source rows listed. Unknown SKUs and invalid
 * quantities are reported per row. Returns a preview only.
 */
export async function previewBulk(input: { customerId: string; text?: string; file?: { buffer: Buffer; filename: string } }) {
  const rawRows: TableRow[] = [];
  if (input.file) {
    const table = await parseTable(input.file.buffer, input.file.filename);
    const missing = missingColumns(table.headers, CUSTOMER_ORDER_COLUMNS);
    if (missing.length) throw errors.validation(`Missing column(s): ${missing.join(', ')}. Use the SKU,QTY template.`);
    rawRows.push(...table.rows);
  } else if (input.text) {
    const lines = input.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 500) throw errors.validation('Paste at most 500 lines at a time');
    lines.forEach((line, i) => {
      const parts = line.split(/[\t,;\s]+/).filter(Boolean);
      rawRows.push({ rowNumber: i + 1, values: { SKU: parts[0] ?? '', QTY: parts[1] ?? '' } });
    });
  } else {
    throw errors.validation('Paste SKU lines or upload a file');
  }

  const max = await getNumberSetting(db, 'order.maxQtyPerSku', 100);
  const issues: BulkRowIssue[] = [];
  const merged = new Map<string, { qty: number; rows: number[] }>();
  for (const r of rawRows) {
    const sku = (r.values.SKU ?? '').trim().toUpperCase();
    const qtyRaw = (r.values.QTY ?? '').trim();
    const input_ = `${sku} ${qtyRaw}`.trim();
    if (!sku) {
      issues.push({ rowNumber: r.rowNumber, input: input_, code: 'SKU_REQUIRED', message: 'SKU is missing' });
      continue;
    }
    const qty = /^\d+$/.test(qtyRaw) ? Number(qtyRaw) : NaN;
    if (!Number.isInteger(qty) || qty <= 0 || qty > max) {
      issues.push({ rowNumber: r.rowNumber, input: input_, code: 'QTY_INVALID', message: `Quantity must be a whole number from 1 to ${max}` });
      continue;
    }
    const cur = merged.get(sku);
    if (cur) {
      cur.qty += qty;
      cur.rows.push(r.rowNumber);
    } else {
      merged.set(sku, { qty, rows: [r.rowNumber] });
    }
  }

  const skuCodes = [...merged.keys()];
  const found = skuCodes.length
    ? await db.sku.findMany({ where: { sku: { in: skuCodes }, published: true, active: true, deletedAt: null }, include: { inventory: true, quality: true } })
    : [];
  const bySku = new Map(found.map((s) => [s.sku, s]));
  const lines: Array<BulkLine & { availableNow: boolean; qualityCode: string | null }> = [];
  for (const [code, m] of merged) {
    const s = bySku.get(code);
    if (!s) {
      for (const row of m.rows) issues.push({ rowNumber: row, input: code, code: 'SKU_UNKNOWN', message: `SKU ${code} was not found` });
      continue;
    }
    const avail = s.inventory ? availableOf(s.inventory.physicalOnHand, s.inventory.reservedQty) : 0;
    lines.push({ sku: s.sku, skuId: s.id, nameEn: s.nameEn, qty: m.qty, sourceRows: m.rows, availableNow: avail >= m.qty, qualityCode: s.quality?.code ?? null });
  }
  return { lines, issues, mergedDuplicates: [...merged.values()].filter((m) => m.rows.length > 1).length, rowsRead: rawRows.length, customerId: input.customerId };
}

/** Adds previewed valid lines to the cart (after the customer reviews the preview). No order is created. */
export async function addBulkToCart(input: { customerId: string; lines: Array<{ sku: string; qty: number }>; priceLevelId: string | null }) {
  const results: Array<{ sku: string; ok: boolean; reason?: string }> = [];
  for (const line of input.lines.slice(0, 500)) {
    try {
      await setCartLine({ customerId: input.customerId, priceLevelId: input.priceLevelId, sku: line.sku, qty: line.qty });
      results.push({ sku: line.sku, ok: true });
    } catch (err) {
      results.push({ sku: line.sku, ok: false, reason: err instanceof Error ? err.message : 'failed' });
    }
  }
  return results;
}

export async function cartLineCount(tx: Tx, customerId: string): Promise<number> {
  const cart = await tx.cart.findUnique({ where: { customerId }, include: { _count: { select: { items: true } } } });
  return cart?._count.items ?? 0;
}

import 'server-only';
import { db, type Tx } from '@/lib/db';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { parseIqdAmount } from '@/lib/money';
import { parseTable, missingColumns, type TableRow } from './table';
import { checksumOf, saveBatchPreview, type RowIssue } from './batch';

/**
 * Price file import (PRODUCT-007, spec 19.2 OPEN-18): columns SKU, PRICE_LEVEL, PRICE. Whole-file atomic.
 * Every changed price writes a PriceChangeHistory row with actor, source and import reference.
 */

export type PriceItem = { rowNumber: number; sku: string; levelCode: string; amount: string };
const SKU_RE = /^[A-Z0-9][A-Z0-9._-]{0,62}$/;

export async function validatePriceRows(client: Tx | typeof db, rows: TableRow[], headers: string[]) {
  const issues: RowIssue[] = [];
  const missing = missingColumns(headers, ['SKU', 'PRICE_LEVEL', 'PRICE']);
  if (missing.length) return { issues: [{ rowNumber: 1, code: 'MISSING_COLUMNS', message: `Missing column(s): ${missing.join(', ')}` }], items: [] as PriceItem[] };
  if (rows.length === 0) issues.push({ rowNumber: 1, code: 'EMPTY_FILE', message: 'No data rows' });

  const levels = await client.priceLevel.findMany({ select: { id: true, code: true, active: true } });
  const levelByCode = new Map(levels.map((l) => [l.code.toUpperCase(), l]));
  const skus = [...new Set(rows.map((r) => (r.values.SKU ?? '').trim().toUpperCase()).filter(Boolean))];
  const known = new Set((await client.sku.findMany({ where: { sku: { in: skus } }, select: { sku: true } })).map((s) => s.sku));

  const seen = new Set<string>();
  const items: PriceItem[] = [];
  for (const row of rows) {
    const rn = row.rowNumber;
    const sku = (row.values.SKU ?? '').trim().toUpperCase();
    const levelCode = (row.values.PRICE_LEVEL ?? '').trim().toUpperCase();
    if (!sku || !SKU_RE.test(sku)) {
      issues.push({ rowNumber: rn, field: 'SKU', code: 'SKU_INVALID', message: 'Valid SKU is required' });
      continue;
    }
    if (!known.has(sku)) {
      issues.push({ rowNumber: rn, field: 'SKU', code: 'SKU_UNKNOWN', message: `SKU ${sku} does not exist` });
      continue;
    }
    const level = levelByCode.get(levelCode);
    if (!level) {
      issues.push({ rowNumber: rn, field: 'PRICE_LEVEL', code: 'LEVEL_UNKNOWN', message: `Unknown price level "${levelCode}"` });
      continue;
    }
    if (!level.active) {
      issues.push({ rowNumber: rn, field: 'PRICE_LEVEL', code: 'LEVEL_INACTIVE', message: `Price level ${levelCode} is inactive` });
      continue;
    }
    const amount = parseIqdAmount((row.values.PRICE ?? '').trim());
    if (!amount) {
      issues.push({ rowNumber: rn, field: 'PRICE', code: 'PRICE_INVALID', message: 'PRICE must be a whole non-negative IQD amount' });
      continue;
    }
    const key = `${sku}|${levelCode}`;
    if (seen.has(key)) {
      issues.push({ rowNumber: rn, field: 'SKU', code: 'DUPLICATE_PRICE_ROW', message: `Duplicate price for ${sku} / ${levelCode}` });
      continue;
    }
    seen.add(key);
    items.push({ rowNumber: rn, sku, levelCode, amount: amount.toFixed(0) });
  }
  return { issues, items };
}

export async function previewPriceImport(input: { buffer: Buffer; filename: string; actorId: string }) {
  const table = await parseTable(input.buffer, input.filename);
  const { issues, items } = await validatePriceRows(db, table.rows, table.headers);
  const batch = await saveBatchPreview({
    type: 'PRICES',
    filename: input.filename,
    checksum: checksumOf(input.buffer),
    uploadedById: input.actorId,
    payload: { items },
    summary: { rows: table.rows.length, valid: items.length, errorCount: issues.length },
    issues,
    freshness: 'FRESH',
    sourceGeneratedAt: null,
  });
  return { batch, issues, valid: items.length };
}

export async function commitPriceImport(input: { importId: string; actorId: string; ip?: string | null }) {
  const result = await db.$transaction(async (tx) => {
    const batch = await tx.importBatch.findUnique({ where: { id: input.importId } });
    if (!batch || batch.type !== 'PRICES') throw errors.notFound('Import not found');
    if (batch.status !== 'PREVIEW_VALID') throw errors.conflict(`Import is ${batch.status}; only a valid preview can be committed`);
    const stored = batch.payload as { items: PriceItem[] };
    const rows: TableRow[] = stored.items.map((it) => ({
      rowNumber: it.rowNumber,
      values: { SKU: it.sku, PRICE_LEVEL: it.levelCode, PRICE: it.amount },
    }));
    const { issues, items } = await validatePriceRows(tx, rows, ['SKU', 'PRICE_LEVEL', 'PRICE']);
    if (issues.length) {
      await tx.importBatch.update({ where: { id: batch.id }, data: { status: 'REJECTED' } });
      await tx.importError.createMany({ data: issues.map((i) => ({ importId: batch.id, rowNumber: i.rowNumber, field: i.field ?? null, code: i.code, message: i.message.slice(0, 500) })) });
      return { rejected: true as const, issues };
    }
    const claimed = await tx.importBatch.updateMany({ where: { id: batch.id, status: 'PREVIEW_VALID' }, data: { status: 'COMMITTED', committedAt: new Date() } });
    if (claimed.count !== 1) throw errors.conflict('Import was already committed');

    const levels = await tx.priceLevel.findMany();
    const levelId = new Map(levels.map((l) => [l.code.toUpperCase(), l.id] as const));
    const skuIds = new Map((await tx.sku.findMany({ where: { sku: { in: items.map((i) => i.sku) } }, select: { id: true, sku: true } })).map((s) => [s.sku, s.id] as const));
    let changed = 0;
    for (const it of items) {
      const skuId = skuIds.get(it.sku)!;
      const priceLevelId = levelId.get(it.levelCode)!;
      const existing = await tx.tierPrice.findUnique({ where: { skuId_priceLevelId: { skuId, priceLevelId } } });
      const newAmount = it.amount;
      if (existing && existing.amount.toFixed(0) === newAmount) continue;
      await tx.tierPrice.upsert({
        where: { skuId_priceLevelId: { skuId, priceLevelId } },
        update: { amount: newAmount, updatedById: input.actorId },
        create: { skuId, priceLevelId, amount: newAmount, currency: 'IQD', updatedById: input.actorId },
      });
      await tx.priceChangeHistory.create({
        data: { skuId, priceLevelId, oldAmount: existing?.amount ?? null, newAmount, actorId: input.actorId, source: 'IMPORT', importId: batch.id },
      });
      changed += 1;
    }
    await writeAudit(tx, { actorId: input.actorId, action: 'import.commit', entityType: 'import', entityId: batch.id, after: { type: 'PRICES', rows: items.length, changed }, ip: input.ip ?? null });
    return { rejected: false as const, applied: items.length, changed };
  });
  if (result.rejected) throw errors.validation('Price import rejected: no prices were changed', { issues: result.issues.slice(0, 200) });
  return result;
}

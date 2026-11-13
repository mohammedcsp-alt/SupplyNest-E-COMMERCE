import 'server-only';
import { db, type Tx } from '@/lib/db';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { parseTable, missingColumns, type TableRow } from './table';
import { checksumOf, saveBatchPreview, type RowIssue } from './batch';
import { lockBalances, syncAlerts } from '@/modules/inventory/inventory';
import { getNumberSetting } from '@/lib/settings';
import { PERMISSIONS } from '@/lib/rbac';

/**
 * Product/SKU + physical stock import (spec IMP-01, PRODUCT-001..009, ACX-04, OPEN-03/06/18).
 *
 * Rules:
 *  - Whole-file validation: any invalid row rejects the ENTIRE file (atomic). Nothing is applied from a preview.
 *  - SKUs absent from the file are NOT changed (PRODUCT-002).
 *  - Existing SKUs are updated (PRODUCT-003). Physical stock is set to the file value (OPEN-03).
 *  - Reservations are never deleted by an import; a physical count below live reservations raises a STOCK_CONFLICT alert.
 *  - EXTRACTED_AT (ISO-8601) is the trusted source time. Missing → freshness UNKNOWN (admin confirmation required).
 *    Older than what is already applied for a SKU → STALE (manager override with reason required, audited).
 *  - Categories and qualities must already exist (controlled vocabulary). Brands and models are created on demand.
 */

export type ProductItem = {
  rowNumber: number;
  sku: string;
  nameEn: string;
  nameAr: string;
  categoryId: string;
  brandName: string | null;
  modelName: string | null;
  qualityId: string | null;
  stock: number;
};

const SKU_RE = /^[A-Z0-9][A-Z0-9._-]{0,62}$/;
const MAX_STOCK = 1_000_000;

export type ValidationOutcome = {
  issues: RowIssue[];
  items: ProductItem[];
  extractedAt: Date | null;
  freshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  staleSkus: string[];
  summary: { rows: number; creates: number; updates: number; absentUnchanged: number; conflictsPreview: number };
};

/** Validates a product file against the CURRENT database state (called both at preview and inside commit). */
export async function validateProductRows(client: Tx | typeof db, rows: TableRow[], headers: string[]): Promise<ValidationOutcome> {
  const issues: RowIssue[] = [];
  const missing = missingColumns(headers, ['SKU', 'CATEGORY', 'PHYSICAL_STOCK']);
  if (missing.length) {
    issues.push({ rowNumber: 1, field: missing.join(','), code: 'MISSING_COLUMNS', message: `Missing required column(s): ${missing.join(', ')}` });
    return { issues, items: [], extractedAt: null, freshness: 'UNKNOWN', staleSkus: [], summary: { rows: rows.length, creates: 0, updates: 0, absentUnchanged: 0, conflictsPreview: 0 } };
  }
  const maxRows = await getNumberSetting(client as Tx, 'import.maxRows', 5000);
  if (rows.length > maxRows) issues.push({ rowNumber: 1, code: 'TOO_MANY_ROWS', message: `File has ${rows.length} rows; limit is ${maxRows}` });
  if (rows.length === 0) issues.push({ rowNumber: 1, code: 'EMPTY_FILE', message: 'No data rows' });

  // Reference data
  const categories = await client.category.findMany({ where: { deletedAt: null }, select: { id: true, slug: true, nameEn: true, nameAr: true } });
  const byKey = new Map<string, string>();
  for (const c of categories) {
    byKey.set(c.id, c.id); // re-validation of a stored preview uses ids
    byKey.set(c.slug.toLowerCase(), c.id);
    byKey.set(c.nameEn.toLowerCase(), c.id);
    byKey.set(c.nameAr.trim(), c.id);
  }
  const qualities = await client.quality.findMany({ select: { id: true, code: true, nameEn: true, nameAr: true } });
  const qualityByKey = new Map<string, string>();
  for (const q of qualities) {
    qualityByKey.set(q.id, q.id);
    qualityByKey.set(q.code.toLowerCase(), q.id);
    qualityByKey.set(q.nameEn.toLowerCase(), q.id);
    qualityByKey.set(q.nameAr.trim(), q.id);
  }
  const hasExtractedCol = headers.includes('EXTRACTED_AT');

  const seen = new Map<string, number>();
  const items: ProductItem[] = [];
  const timestamps = new Set<string>();

  for (const row of rows) {
    const v = row.values;
    const sku = (v.SKU ?? '').trim().toUpperCase();
    const rn = row.rowNumber;
    if (!sku) {
      issues.push({ rowNumber: rn, field: 'SKU', code: 'SKU_REQUIRED', message: 'SKU is required' });
      continue;
    }
    if (!SKU_RE.test(sku)) {
      issues.push({ rowNumber: rn, field: 'SKU', code: 'SKU_INVALID', message: `Invalid SKU "${sku}" (letters, digits, . _ - ; max 63)` });
      continue;
    }
    if (seen.has(sku)) {
      issues.push({ rowNumber: rn, field: 'SKU', code: 'SKU_DUPLICATE_IN_FILE', message: `SKU ${sku} also appears on row ${seen.get(sku)}` });
      continue;
    }
    seen.set(sku, rn);

    const nameEn = (v.NAME_EN ?? '').trim();
    const nameAr = (v.NAME_AR ?? '').trim();
    if (!nameEn && !nameAr) issues.push({ rowNumber: rn, field: 'NAME_EN', code: 'NAME_REQUIRED', message: 'Provide NAME_EN or NAME_AR' });

    const categoryRaw = (v.CATEGORY ?? '').trim();
    const categoryId = categoryRaw ? byKey.get(categoryRaw.toLowerCase()) ?? byKey.get(categoryRaw) ?? null : null;
    if (!categoryId) issues.push({ rowNumber: rn, field: 'CATEGORY', code: 'CATEGORY_UNKNOWN', message: `Unknown category "${categoryRaw || '(empty)'}"` });

    const stockRaw = (v.PHYSICAL_STOCK ?? '').trim();
    const stock = /^\d+$/.test(stockRaw) ? Number(stockRaw) : NaN;
    if (!Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) {
      issues.push({ rowNumber: rn, field: 'PHYSICAL_STOCK', code: 'STOCK_INVALID', message: `PHYSICAL_STOCK must be a whole number 0–${MAX_STOCK}` });
    }

    let qualityId: string | null = null;
    const qualityRaw = (v.QUALITY ?? '').trim();
    if (qualityRaw) {
      qualityId = qualityByKey.get(qualityRaw.toLowerCase()) ?? qualityByKey.get(qualityRaw) ?? null;
      if (!qualityId) issues.push({ rowNumber: rn, field: 'QUALITY', code: 'QUALITY_UNKNOWN', message: `Unknown quality "${qualityRaw}"` });
    }

    if (hasExtractedCol && v.EXTRACTED_AT) {
      const t = new Date(v.EXTRACTED_AT);
      if (Number.isNaN(t.getTime()) || !/^\d{4}-\d{2}-\d{2}T/.test(v.EXTRACTED_AT)) {
        issues.push({ rowNumber: rn, field: 'EXTRACTED_AT', code: 'TIMESTAMP_INVALID', message: 'EXTRACTED_AT must be ISO-8601, e.g. 2026-11-13T08:00:00Z' });
      } else {
        timestamps.add(t.toISOString());
      }
    }

    if (categoryId && Number.isInteger(stock)) {
      items.push({
        rowNumber: rn,
        sku,
        nameEn: nameEn || nameAr,
        nameAr: nameAr || nameEn,
        categoryId,
        brandName: (v.BRAND ?? '').trim() || null,
        modelName: (v.MODEL ?? '').trim() || null,
        qualityId,
        stock,
      });
    }
  }

  if (timestamps.size > 1) {
    issues.push({ rowNumber: 1, field: 'EXTRACTED_AT', code: 'EXTRACTED_AT_INCONSISTENT', message: 'All rows must share one EXTRACTED_AT (one extraction manifest per file)' });
  }
  const extractedAt = timestamps.size === 1 ? new Date([...timestamps][0]) : null;

  // Existing SKUs and their trusted source timestamps (freshness check, PRODUCT-016/ACX-04)
  const skuList = [...seen.keys()];
  return finishValidation(client, { issues, items, extractedAt, skuList, rowCount: rows.length, hasExtractedCol });
}

// Helper kept separate so the main function reads top-down.
async function finishValidation(
  client: Tx | typeof db,
  ctx: { issues: RowIssue[]; items: ProductItem[]; extractedAt: Date | null; skuList: string[]; rowCount: number; hasExtractedCol: boolean },
): Promise<ValidationOutcome> {
  const existingSkus = ctx.skuList.length
    ? await client.sku.findMany({ where: { sku: { in: ctx.skuList } }, select: { id: true, sku: true, inventory: { select: { sourceTimestamp: true } } } })
    : [];
  const existingSet = new Set(existingSkus.map((s) => s.sku));
  const staleSkus: string[] = [];
  if (ctx.extractedAt) {
    for (const s of existingSkus) {
      const src = s.inventory?.sourceTimestamp;
      if (src && src.getTime() > ctx.extractedAt.getTime()) staleSkus.push(s.sku);
    }
  }
  const freshness: 'FRESH' | 'STALE' | 'UNKNOWN' = !ctx.hasExtractedCol || !ctx.extractedAt ? 'UNKNOWN' : staleSkus.length ? 'STALE' : 'FRESH';
  const creates = ctx.items.filter((i) => !existingSet.has(i.sku)).length;
  const updates = ctx.items.length - creates;
  const absentUnchanged = Math.max(0, (await countAllSkus(client)) - existingSkus.length);
  return {
    issues: ctx.issues,
    items: ctx.items,
    extractedAt: ctx.extractedAt,
    freshness,
    staleSkus,
    summary: { rows: ctx.rowCount, creates, updates, absentUnchanged, conflictsPreview: staleSkus.length },
  };
}

async function countAllSkus(client: Tx | typeof db): Promise<number> {
  return client.sku.count();
}

/** Preview: parse, validate, store the normalized batch. No stock changes. */
export async function previewProductImport(input: { buffer: Buffer; filename: string; actorId: string }) {
  const table = await parseTable(input.buffer, input.filename);
  const outcome = await validateProductRows(db, table.rows, table.headers);
  const batch = await saveBatchPreview({
    type: 'PRODUCTS',
    filename: input.filename,
    checksum: checksumOf(input.buffer),
    uploadedById: input.actorId,
    payload: { items: outcome.items, extractedAt: outcome.extractedAt?.toISOString() ?? null, staleSkus: outcome.staleSkus },
    summary: { ...outcome.summary, freshness: outcome.freshness, format: table.format, errorCount: outcome.issues.length },
    issues: outcome.issues,
    freshness: outcome.freshness,
    sourceGeneratedAt: outcome.extractedAt,
  });
  return { batch, outcome };
}

type CommitInput = {
  importId: string;
  actorId: string;
  actorPermissions: ReadonlySet<string>;
  acknowledgeUnknownFreshness?: boolean;
  override?: { reason: string };
  ip?: string | null;
};

/**
 * Atomic commit. Re-validates against the current database inside the transaction, enforces the freshness gate,
 * then applies all changes or none.
 */
export async function commitProductImport(input: CommitInput) {
  const result = await db.$transaction(async (tx) => {
    const batch = await tx.importBatch.findUnique({ where: { id: input.importId } });
    if (!batch || batch.type !== 'PRODUCTS') throw errors.notFound('Import not found');
    if (batch.status !== 'PREVIEW_VALID') throw errors.conflict(`Import is ${batch.status}; only a valid preview can be committed`);

    // Re-validate from the stored preview payload is NOT enough (DB may have changed): rebuild rows from payload.
    const stored = batch.payload as { items: ProductItem[]; extractedAt: string | null };
    const rows: TableRow[] = stored.items.map((it) => ({
      rowNumber: it.rowNumber,
      values: {
        SKU: it.sku,
        NAME_EN: it.nameEn,
        NAME_AR: it.nameAr,
        CATEGORY: it.categoryId,
        PHYSICAL_STOCK: String(it.stock),
        BRAND: it.brandName ?? '',
        MODEL: it.modelName ?? '',
        QUALITY: it.qualityId ?? '',
        EXTRACTED_AT: stored.extractedAt ?? '',
      },
    }));
    const headers = ['SKU', 'NAME_EN', 'NAME_AR', 'CATEGORY', 'PHYSICAL_STOCK', 'BRAND', 'MODEL', 'QUALITY', 'EXTRACTED_AT'];
    const outcome = await validateProductRows(tx, rows, headers.filter((h) => h !== 'EXTRACTED_AT' || stored.extractedAt));

    if (outcome.issues.length) {
      // Keep evidence, apply nothing.
      await tx.importBatch.update({ where: { id: batch.id }, data: { status: 'REJECTED' } });
      await tx.importError.createMany({ data: outcome.issues.map((i) => ({ importId: batch.id, rowNumber: i.rowNumber, field: i.field ?? null, code: i.code, message: i.message.slice(0, 500) })) });
      return { rejected: true as const, issues: outcome.issues };
    }

    // Freshness gate (ACX-04, OPEN-06)
    if (outcome.freshness === 'UNKNOWN' && !input.acknowledgeUnknownFreshness) {
      throw errors.staleApproval('This file has no trusted EXTRACTED_AT time. Confirm the import to continue.', { freshness: 'UNKNOWN' });
    }
    let override: { actorId: string; reason: string } | null = null;
    if (outcome.freshness === 'STALE') {
      if (!input.override) {
        throw errors.staleApproval('This file is older than data already applied. A manager must approve with a reason.', {
          freshness: 'STALE',
          staleSkuCount: outcome.staleSkus.length,
        });
      }
      if (!input.actorPermissions.has(PERMISSIONS.IMPORT_OVERRIDE_STALE)) throw errors.forbidden('Only a manager can approve a stale file');
      if (input.override.reason.trim().length < 3) throw errors.validation('An override reason is required');
      override = { actorId: input.actorId, reason: input.override.reason.trim() };
    }

    const claimed = await tx.importBatch.updateMany({
      where: { id: batch.id, status: 'PREVIEW_VALID' },
      data: { status: 'COMMITTED', committedAt: new Date(), overrideById: override?.actorId ?? null, overrideReason: override?.reason ?? null, freshness: outcome.freshness },
    });
    if (claimed.count !== 1) throw errors.conflict('Import was already committed');

    const extractedAt = outcome.extractedAt;
    const brandCache = new Map<string, string>();
    const touchedSkuIds: string[] = [];

    for (const it of outcome.items) {
      // brand & model (auto-created master data)
      let brandId: string | null = null;
      if (it.brandName) {
        brandId = brandCache.get(it.brandName) ?? null;
        if (!brandId) {
          let brand = await tx.brand.findUnique({ where: { name: it.brandName } });
          if (!brand) {
            brand = await tx.brand.create({ data: { name: it.brandName, slug: brandSlug(it.brandName) } });
          }
          brandId = brand.id;
          brandCache.set(it.brandName, brandId);
        }
      }
      let modelId: string | null = null;
      if (it.modelName) {
        const normalizedName = it.modelName.trim().toLowerCase();
        let model = await tx.productModel.findFirst({ where: { brandId, normalizedName } });
        if (!model) model = await tx.productModel.create({ data: { brandId, name: it.modelName.trim(), normalizedName } });
        modelId = model.id;
      }

      const existing = await tx.sku.findUnique({ where: { sku: it.sku } });
      const sku = existing
        ? await tx.sku.update({
            where: { id: existing.id },
            data: { categoryId: it.categoryId, brandId, modelId, qualityId: it.qualityId, nameEn: it.nameEn, nameAr: it.nameAr, deletedAt: null },
          })
        : await tx.sku.create({
            data: { sku: it.sku, categoryId: it.categoryId, brandId, modelId, qualityId: it.qualityId, nameEn: it.nameEn, nameAr: it.nameAr, published: false, active: true },
          });
      touchedSkuIds.push(sku.id);

      const balances = await lockBalances(tx, [sku.id]);
      const b = balances.get(sku.id)!;
      const delta = it.stock - b.physicalOnHand;
      await tx.inventoryBalance.update({
        where: { skuId: sku.id },
        data: {
          physicalOnHand: it.stock,
          version: { increment: 1 },
          ...(extractedAt ? { sourceTimestamp: extractedAt } : {}),
        },
      });
      await tx.inventoryMovement.create({
        data: {
          skuId: sku.id,
          qtyDelta: delta,
          balanceAfter: it.stock,
          movementType: 'IMPORT_SET',
          sourceRef: batch.id,
          actorId: input.actorId,
          note: extractedAt ? `import ${batch.filename} extracted ${extractedAt.toISOString()}` : `import ${batch.filename} (freshness UNKNOWN)`,
        },
      });
    }

    await syncAlerts(tx, touchedSkuIds);
    await writeAudit(tx, {
      actorId: input.actorId,
      action: 'import.commit',
      entityType: 'import',
      entityId: batch.id,
      after: { type: 'PRODUCTS', rows: outcome.items.length, freshness: outcome.freshness, staleSkuCount: outcome.staleSkus.length },
      reason: override?.reason ?? null,
      ip: input.ip ?? null,
    });
    return { rejected: false as const, applied: outcome.items.length, freshness: outcome.freshness, touched: touchedSkuIds.length };
  });

  if (result.rejected) throw errors.validation('Import rejected: no rows were applied', { issues: result.issues.slice(0, 200) });
  return result;
}

/** URL-safe unique slug for a brand name (Arabic-safe: falls back to a random suffix). */
export function brandSlug(name: string): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'brand'}-${Math.random().toString(36).slice(2, 8)}`;
}

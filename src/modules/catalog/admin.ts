import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { AttributeType, Prisma } from '@prisma/client';
import { db, type Tx } from '@/lib/db';
import { config } from '@/lib/config';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { parseIqdAmount, toApiAmount } from '@/lib/money';
import { availableOf } from '@/modules/inventory/inventory';

export const MAX_IMAGES_PER_SKU = 10;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/* ----------------------------------------------------------------- SKUs */

export type SkuInput = {
  sku: string;
  categoryId: string;
  brandId?: string | null;
  modelId?: string | null;
  qualityId?: string | null;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  unit?: string;
  published?: boolean;
  active?: boolean;
};

export function normalizeSkuCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,62}$/.test(code)) throw errors.validation('SKU must be 1–63 characters: letters, digits, . _ -');
  return code;
}

async function assertCategoryExists(tx: Tx, categoryId: string) {
  const c = await tx.category.findFirst({ where: { id: categoryId, deletedAt: null } });
  if (!c) throw errors.validation('Category does not exist or is deleted');
}

export async function createSku(actorId: string, input: SkuInput, ip?: string | null) {
  const code = normalizeSkuCode(input.sku);
  return db.$transaction(async (tx) => {
    if (await tx.sku.findUnique({ where: { sku: code } })) throw errors.conflict('SKU already exists');
    await assertCategoryExists(tx, input.categoryId);
    const created = await tx.sku.create({
      data: {
        sku: code,
        categoryId: input.categoryId,
        brandId: input.brandId ?? null,
        modelId: input.modelId ?? null,
        qualityId: input.qualityId ?? null,
        nameAr: input.nameAr.trim(),
        nameEn: input.nameEn.trim(),
        descriptionAr: input.descriptionAr ?? null,
        descriptionEn: input.descriptionEn ?? null,
        unit: input.unit ?? 'PCS',
        published: input.published ?? false,
        active: input.active ?? true,
      },
    });
    await tx.inventoryBalance.create({ data: { skuId: created.id } });
    await writeAudit(tx, { actorId, action: 'sku.create', entityType: 'sku', entityId: created.id, after: { sku: code }, ip: ip ?? null });
    return created;
  });
}

export async function updateSku(actorId: string, skuId: string, input: Partial<Omit<SkuInput, 'sku'>>, ip?: string | null) {
  return db.$transaction(async (tx) => {
    const before = await tx.sku.findUnique({ where: { id: skuId } });
    if (!before || before.deletedAt) throw errors.notFound('SKU not found');
    if (input.categoryId) await assertCategoryExists(tx, input.categoryId);
    const after = await tx.sku.update({
      where: { id: skuId },
      data: {
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.brandId !== undefined ? { brandId: input.brandId } : {}),
        ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
        ...(input.qualityId !== undefined ? { qualityId: input.qualityId } : {}),
        ...(input.nameAr !== undefined ? { nameAr: input.nameAr.trim() } : {}),
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn.trim() } : {}),
        ...(input.descriptionAr !== undefined ? { descriptionAr: input.descriptionAr } : {}),
        ...(input.descriptionEn !== undefined ? { descriptionEn: input.descriptionEn } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.published !== undefined ? { published: input.published } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    await writeAudit(tx, {
      actorId,
      action: 'sku.update',
      entityType: 'sku',
      entityId: skuId,
      before: { nameEn: before.nameEn, published: before.published, active: before.active, categoryId: before.categoryId },
      after: { nameEn: after.nameEn, published: after.published, active: after.active, categoryId: after.categoryId },
      ip: ip ?? null,
    });
    return after;
  });
}

/** Admin SKU detail: all price levels, stock figures, images and recent history. Never public. */
export async function getAdminSku(skuId: string) {
  const sku = await db.sku.findUnique({
    where: { id: skuId },
    include: {
      category: true,
      brand: true,
      model: true,
      quality: true,
      images: { orderBy: { sortOrder: 'asc' } },
      tierPrices: { include: { priceLevel: true } },
      inventory: true,
      attributeValues: { include: { definition: true } },
      alerts: { where: { state: 'OPEN' } },
    },
  });
  if (!sku) throw errors.notFound('SKU not found');
  const history = await db.priceChangeHistory.findMany({ where: { skuId }, orderBy: { occurredAt: 'desc' }, take: 50, include: { priceLevel: true } });
  const moves = await db.inventoryMovement.findMany({ where: { skuId }, orderBy: { occurredAt: 'desc' }, take: 50 });
  const inv = sku.inventory;
  return {
    sku,
    prices: sku.tierPrices.map((t) => ({ levelId: t.priceLevelId, levelCode: t.priceLevel.code, amount: toApiAmount(t.amount), active: t.priceLevel.active })),
    stock: {
      physicalOnHand: inv?.physicalOnHand ?? 0,
      reservedQty: inv?.reservedQty ?? 0,
      availableQty: inv ? availableOf(inv.physicalOnHand, inv.reservedQty) : 0,
      sourceTimestamp: inv?.sourceTimestamp ?? null,
    },
    priceHistory: history.map((h) => ({ level: h.priceLevel.code, oldAmount: toApiAmount(h.oldAmount), newAmount: toApiAmount(h.newAmount), actorId: h.actorId, source: h.source, occurredAt: h.occurredAt })),
    movements: moves,
  };
}

/* ----------------------------------------------------------------- tier prices */

export async function setTierPrice(actorId: string, input: { skuId: string; priceLevelId: string; amount: string; reason: string; ip?: string | null }) {
  const amount = parseIqdAmount(input.amount);
  if (!amount) throw errors.validation('Price must be a whole non-negative IQD amount');
  return db.$transaction(async (tx) => {
    const level = await tx.priceLevel.findUnique({ where: { id: input.priceLevelId } });
    if (!level) throw errors.validation('Unknown price level');
    const sku = await tx.sku.findUnique({ where: { id: input.skuId } });
    if (!sku || sku.deletedAt) throw errors.notFound('SKU not found');
    const existing = await tx.tierPrice.findUnique({ where: { skuId_priceLevelId: { skuId: sku.id, priceLevelId: level.id } } });
    if (existing && existing.amount.equals(amount)) return { changed: false, amount: amount.toFixed(0) };
    await tx.tierPrice.upsert({
      where: { skuId_priceLevelId: { skuId: sku.id, priceLevelId: level.id } },
      update: { amount, updatedById: actorId },
      create: { skuId: sku.id, priceLevelId: level.id, amount, currency: 'IQD', updatedById: actorId },
    });
    await tx.priceChangeHistory.create({
      data: { skuId: sku.id, priceLevelId: level.id, oldAmount: existing?.amount ?? null, newAmount: amount, actorId, source: 'MANUAL' },
    });
    await writeAudit(tx, {
      actorId,
      action: 'price.change',
      entityType: 'sku',
      entityId: sku.id,
      before: { level: level.code, amount: existing ? existing.amount.toFixed(0) : null },
      after: { level: level.code, amount: amount.toFixed(0) },
      reason: input.reason,
      ip: input.ip ?? null,
    });
    return { changed: true, amount: amount.toFixed(0) };
  });
}

/* ----------------------------------------------------------------- images */

const SIGNATURES: Array<{ mime: string; ext: string; test: (b: Buffer) => boolean }> = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];

/** Magic-byte check: the declared type is ignored; the bytes decide (no script or SVG uploads). */
export function sniffImage(bytes: Buffer): { mime: string; ext: string } | null {
  const hit = SIGNATURES.find((s) => s.test(bytes));
  return hit ? { mime: hit.mime, ext: hit.ext } : null;
}

export async function addSkuImage(actorId: string, input: { skuId: string; bytes: Buffer; altText?: string | null; ip?: string | null }) {
  if (input.bytes.length === 0 || input.bytes.length > MAX_IMAGE_BYTES) throw errors.validation('Image must be 1 byte to 5 MB');
  const kind = sniffImage(input.bytes);
  if (!kind) throw errors.validation('Only JPEG, PNG or WebP images are accepted');
  const base = path.resolve(config.UPLOAD_DIR);
  const relDir = path.join('products', input.skuId);
  const fileKey = path.join(relDir, `${randomUUID()}.${kind.ext}`).replace(/\\/g, '/');
  const full = path.resolve(base, fileKey);
  if (!full.startsWith(base + path.sep)) throw errors.validation('Invalid upload path');

  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, input.bytes, { flag: 'wx' });
  try {
    return await db.$transaction(async (tx) => {
      // Serialize image additions per SKU so the 10-image limit cannot be raced past.
      await tx.$queryRaw`SELECT "id" FROM "product_skus" WHERE "id" = ${input.skuId}::uuid FOR UPDATE`;
      const count = await tx.skuImage.count({ where: { skuId: input.skuId } });
      if (count >= MAX_IMAGES_PER_SKU) throw errors.validation(`A SKU may have at most ${MAX_IMAGES_PER_SKU} images`);
      const img = await tx.skuImage.create({
        data: { skuId: input.skuId, fileKey, mimeType: kind.mime, sortOrder: count, altText: input.altText ?? null },
      });
      await writeAudit(tx, { actorId, action: 'sku.image.add', entityType: 'sku', entityId: input.skuId, after: { imageId: img.id }, ip: input.ip ?? null });
      return img;
    });
  } catch (err) {
    await unlink(full).catch(() => undefined);
    throw err;
  }
}

export async function removeSkuImage(actorId: string, imageId: string, ip?: string | null) {
  const img = await db.skuImage.findUnique({ where: { id: imageId } });
  if (!img) throw errors.notFound('Image not found');
  await db.$transaction(async (tx) => {
    await tx.skuImage.delete({ where: { id: imageId } });
    await writeAudit(tx, { actorId, action: 'sku.image.remove', entityType: 'sku', entityId: img.skuId, before: { imageId }, ip: ip ?? null });
  });
  const base = path.resolve(config.UPLOAD_DIR);
  const full = path.resolve(base, img.fileKey);
  if (full.startsWith(base + path.sep)) await unlink(full).catch(() => undefined);
}

/* ----------------------------------------------------------------- categories & attributes */

export async function upsertCategory(actorId: string, input: { id?: string; slug: string; nameAr: string; nameEn: string; parentId?: string | null; sortOrder?: number; active?: boolean }) {
  return db.$transaction(async (tx) => {
    if (input.parentId) {
      if (input.id && input.parentId === input.id) throw errors.validation('A category cannot be its own parent');
      const parent = await tx.category.findUnique({ where: { id: input.parentId } });
      if (!parent) throw errors.validation('Parent category not found');
      if (input.id) {
        // cycle check: walk up from the proposed parent
        let cursor: string | null = parent.id;
        for (let depth = 0; cursor && depth < 200; depth++) {
          if (cursor === input.id) throw errors.validation('This move would create a category cycle');
          cursor = (await tx.category.findUnique({ where: { id: cursor }, select: { parentId: true } }))?.parentId ?? null;
        }
      }
    }
    const data = {
      slug: input.slug.trim().toLowerCase(),
      nameAr: input.nameAr.trim(),
      nameEn: input.nameEn.trim(),
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? 0,
      active: input.active ?? true,
    };
    const saved = input.id
      ? await tx.category.update({ where: { id: input.id }, data })
      : await tx.category.create({ data });
    await writeAudit(tx, { actorId, action: input.id ? 'category.update' : 'category.create', entityType: 'category', entityId: saved.id, after: data });
    return saved;
  });
}

export async function upsertAttribute(
  actorId: string,
  input: { categoryId: string; key: string; labelAr: string; labelEn: string; dataType: AttributeType; unit?: string | null; options?: string[] | null; filterable?: boolean; sortOrder?: number },
) {
  if (!/^[a-z][a-z0-9_]{1,59}$/.test(input.key)) throw errors.validation('Attribute key must be lowercase snake_case');
  if (input.dataType === 'ENUM' && (!input.options || input.options.length === 0)) throw errors.validation('Enum attributes need options');
  return db.$transaction(async (tx) => {
    const data = {
      categoryId: input.categoryId,
      key: input.key,
      labelAr: input.labelAr.trim(),
      labelEn: input.labelEn.trim(),
      dataType: input.dataType,
      unit: input.unit ?? null,
      options: (input.options ?? undefined) as Prisma.InputJsonValue | undefined,
      filterable: input.filterable ?? false,
      sortOrder: input.sortOrder ?? 0,
    };
    const saved = await tx.attributeDefinition.upsert({
      where: { categoryId_key: { categoryId: input.categoryId, key: input.key } },
      update: data,
      create: data,
    });
    await writeAudit(tx, { actorId, action: 'attribute.upsert', entityType: 'attribute_definition', entityId: saved.id, after: { key: input.key, categoryId: input.categoryId } });
    return saved;
  });
}

/** Validates and stores attribute values for a SKU against its category definitions (typed; no free-form junk). */
export async function setSkuAttributes(actorId: string, skuId: string, values: Record<string, string | number | boolean | null>) {
  return db.$transaction(async (tx) => {
    const sku = await tx.sku.findUnique({ where: { id: skuId } });
    if (!sku) throw errors.notFound('SKU not found');
    const defs = await tx.attributeDefinition.findMany({ where: { categoryId: sku.categoryId } });
    const byKey = new Map(defs.map((d) => [d.key, d]));
    for (const key of Object.keys(values)) {
      if (!byKey.has(key)) throw errors.validation(`Attribute "${key}" is not defined for this category`);
    }
    for (const def of defs) {
      const raw = values[def.key];
      if (raw === undefined || raw === null || raw === '') {
        if (def.required) throw errors.validation(`Attribute ${def.key} is required`);
        await tx.skuAttributeValue.deleteMany({ where: { skuId, attributeDefinitionId: def.id } });
        continue;
      }
      let text: string;
      if (def.dataType === 'NUMBER') {
        const n = Number(raw);
        if (!Number.isFinite(n)) throw errors.validation(`${def.key} must be a number`);
        text = String(n);
      } else if (def.dataType === 'BOOLEAN') {
        text = raw === true || raw === 'true' ? 'true' : 'false';
      } else if (def.dataType === 'ENUM') {
        const opts = (def.options as string[] | null) ?? [];
        if (!opts.includes(String(raw))) throw errors.validation(`${def.key} must be one of: ${opts.join(', ')}`);
        text = String(raw);
      } else {
        text = String(raw).slice(0, 500);
      }
      await tx.skuAttributeValue.upsert({
        where: { skuId_attributeDefinitionId: { skuId, attributeDefinitionId: def.id } },
        update: { value: text },
        create: { skuId, attributeDefinitionId: def.id, value: text },
      });
    }
    await writeAudit(tx, { actorId, action: 'sku.attributes.set', entityType: 'sku', entityId: skuId, after: values as Prisma.InputJsonValue });
  });
}

/* ----------------------------------------------------------------- brands, models, qualities */

export async function upsertBrand(actorId: string, input: { name: string; active?: boolean }) {
  const name = input.name.trim();
  const slug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `brand-${randomUUID().slice(0, 8)}`;
  return db.$transaction(async (tx) => {
    const existing = await tx.brand.findUnique({ where: { name } });
    if (existing) return existing;
    const b = await tx.brand.create({ data: { name, slug: `${slug}-${randomUUID().slice(0, 4)}`, active: input.active ?? true } });
    await writeAudit(tx, { actorId, action: 'brand.create', entityType: 'brand', entityId: b.id, after: { name } });
    return b;
  });
}

export async function upsertQuality(actorId: string, input: { code: string; nameAr: string; nameEn: string; sortOrder?: number; active?: boolean }) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(code)) throw errors.validation('Quality code must be UPPER_SNAKE_CASE');
  return db.$transaction(async (tx) => {
    const q = await tx.quality.upsert({
      where: { code },
      update: { nameAr: input.nameAr.trim(), nameEn: input.nameEn.trim(), sortOrder: input.sortOrder ?? 0, active: input.active ?? true },
      create: { code, nameAr: input.nameAr.trim(), nameEn: input.nameEn.trim(), sortOrder: input.sortOrder ?? 0, active: input.active ?? true },
    });
    await writeAudit(tx, { actorId, action: 'quality.upsert', entityType: 'quality', entityId: q.id, after: { code } });
    return q;
  });
}

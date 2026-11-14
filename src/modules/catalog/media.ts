import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/lib/db';
import { config } from '@/lib/config';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { MAX_IMAGE_BYTES, sniffImage } from './admin';

/**
 * Images for categories, brands and CMS banners (V3.3).
 * Same rules as SKU images: magic-byte sniffing (JPEG/PNG/WebP only), a 5 MB limit, files stored under UPLOAD_DIR with
 * database-derived paths, audited changes, and removal of the previous file after a successful replacement.
 * Public reads are limited to ACTIVE owners.
 */
export type ImageOwner = 'category' | 'brand' | 'banner';

const DIR: Record<ImageOwner, string> = { category: 'categories', brand: 'brands', banner: 'banners' };
const ENTITY: Record<ImageOwner, string> = { category: 'category', brand: 'brand', banner: 'cms_banner' };

async function loadOwner(owner: ImageOwner, id: string): Promise<{ id: string; imageKey: string | null; active: boolean } | null> {
  if (owner === 'category') {
    const r = await db.category.findUnique({ where: { id }, select: { id: true, imageKey: true, active: true, deletedAt: true } });
    return r ? { id: r.id, imageKey: r.imageKey, active: r.active && !r.deletedAt } : null;
  }
  if (owner === 'brand') {
    const r = await db.brand.findUnique({ where: { id }, select: { id: true, imageKey: true, active: true } });
    return r ? { id: r.id, imageKey: r.imageKey, active: r.active } : null;
  }
  const r = await db.cmsBanner.findUnique({ where: { id }, select: { id: true, imageKey: true, active: true } });
  return r ? { id: r.id, imageKey: r.imageKey, active: r.active } : null;
}

async function writeOwnerKey(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], owner: ImageOwner, id: string, imageKey: string | null) {
  if (owner === 'category') await tx.category.update({ where: { id }, data: { imageKey } });
  else if (owner === 'brand') await tx.brand.update({ where: { id }, data: { imageKey } });
  else await tx.cmsBanner.update({ where: { id }, data: { imageKey } });
}

function resolveInside(fileKey: string): string {
  const base = path.resolve(config.UPLOAD_DIR);
  const full = path.resolve(base, fileKey);
  if (!full.startsWith(base + path.sep)) throw errors.validation('Invalid file path');
  return full;
}

async function removeFileSafe(fileKey: string | null) {
  if (!fileKey) return;
  await unlink(resolveInside(fileKey)).catch(() => undefined);
}

export function publicImageUrl(owner: ImageOwner, id: string): string {
  if (owner === 'category') return `/api/v1/public/categories/${id}/image`;
  if (owner === 'brand') return `/api/v1/public/brands/${id}/image`;
  return `/api/v1/cms/banners/${id}/image`;
}

/** Stores a new image for the owner, replaces the previous one, and audits the change. */
export async function setOwnerImage(actorId: string, owner: ImageOwner, id: string, bytes: Buffer, ip: string | null) {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw errors.validation('Image must be 1 byte to 5 MB');
  const kind = sniffImage(bytes);
  if (!kind) throw errors.validation('Only JPEG, PNG or WebP images are accepted');
  const existing = await loadOwner(owner, id);
  if (!existing) throw errors.notFound('Record not found');

  const fileKey = `${DIR[owner]}/${id}/${randomUUID()}.${kind.ext}`;
  const full = resolveInside(fileKey);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes, { flag: 'wx' });
  try {
    await db.$transaction(async (tx) => {
      await writeOwnerKey(tx, owner, id, fileKey);
      await writeAudit(tx, {
        actorId,
        action: `${owner}.image.set`,
        entityType: ENTITY[owner],
        entityId: id,
        before: { imageKey: existing.imageKey },
        after: { imageKey: fileKey, mime: kind.mime },
        ip,
      });
    });
  } catch (err) {
    await unlink(full).catch(() => undefined);
    throw err;
  }
  await removeFileSafe(existing.imageKey);
  return { imageKey: fileKey, url: publicImageUrl(owner, id) };
}

/** Removes the owner's image (the record stays; only the reference and the file are removed). */
export async function clearOwnerImage(actorId: string, owner: ImageOwner, id: string, ip: string | null) {
  const existing = await loadOwner(owner, id);
  if (!existing) throw errors.notFound('Record not found');
  await db.$transaction(async (tx) => {
    await writeOwnerKey(tx, owner, id, null);
    await writeAudit(tx, { actorId, action: `${owner}.image.clear`, entityType: ENTITY[owner], entityId: id, before: { imageKey: existing.imageKey }, after: { imageKey: null }, ip });
  });
  await removeFileSafe(existing.imageKey);
  return { cleared: true };
}

/** Reads an owner's image. Public callers only receive images of ACTIVE owners. */
export async function readOwnerImage(owner: ImageOwner, id: string, opts: { publicOnly: boolean }): Promise<{ bytes: Buffer; mime: string } | null> {
  const row = await loadOwner(owner, id);
  if (!row || !row.imageKey) return null;
  if (opts.publicOnly && !row.active) return null;
  const mime = row.imageKey.endsWith('.png') ? 'image/png' : row.imageKey.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  try {
    return { bytes: await readFile(resolveInside(row.imageKey)), mime };
  } catch {
    return null;
  }
}

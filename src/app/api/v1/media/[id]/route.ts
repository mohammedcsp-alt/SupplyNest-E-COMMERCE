import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { apiRoute, type RouteContext } from '@/lib/api';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * Serves a SKU image by database id. Only images of PUBLISHED, active SKUs are served publicly; the file path
 * comes from the database (never from the request), and is verified to stay inside the upload directory.
 */
export const GET = apiRoute<{ id: string }>(async (_req, ctx: RouteContext<{ id: string }>) => {
  const { id } = await ctx.params;
  const image = await db.skuImage.findUnique({ where: { id }, include: { sku: { select: { published: true, active: true, deletedAt: true } } } });
  if (!image || !image.sku.published || !image.sku.active || image.sku.deletedAt) throw errors.notFound('Image not found');

  const base = path.resolve(config.UPLOAD_DIR);
  const full = path.resolve(base, image.fileKey);
  if (!full.startsWith(base + path.sep)) throw errors.notFound('Image not found');
  let bytes: Buffer;
  try {
    bytes = await readFile(full);
  } catch {
    throw errors.notFound('Image not found');
  }
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': image.mimeType,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

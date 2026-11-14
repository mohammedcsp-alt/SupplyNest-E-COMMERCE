import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { apiRoute, type RouteContext } from '@/lib/api';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/** Serves the image of an ACTIVE CMS banner. The path comes from the database and must stay inside the upload directory. */
export const GET = apiRoute<{ id: string }>(async (_req, ctx: RouteContext<{ id: string }>) => {
  const { id } = await ctx.params;
  const banner = await db.cmsBanner.findUnique({ where: { id } });
  if (!banner || !banner.active || !banner.imageKey) throw errors.notFound('Image not found');
  const base = path.resolve(config.UPLOAD_DIR);
  const full = path.resolve(base, banner.imageKey);
  if (!full.startsWith(base + path.sep)) throw errors.notFound('Image not found');
  let bytes: Buffer;
  try {
    bytes = await readFile(full);
  } catch {
    throw errors.notFound('Image not found');
  }
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' },
  });
});

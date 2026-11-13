import { apiRoute, type RouteContext } from '@/lib/api';
import { errors } from '@/lib/errors';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TEMPLATES: Record<string, { file: string; header: string; sample: string }> = {
  products: {
    file: 'b2b-products-template.csv',
    header: 'SKU,NAME_EN,NAME_AR,MODEL,BRAND,QUALITY,CATEGORY,PHYSICAL_STOCK,EXTRACTED_AT',
    sample: 'DEV-TS-M-BL,Cotton T-shirt M Black,تيشيرت قطن M أسود,Classic,Synthetic Contoso,ORIGINAL,dev-tshirts,40,2026-11-13T08:00:00Z',
  },
  prices: {
    file: 'b2b-prices-template.csv',
    header: 'SKU,PRICE_LEVEL,PRICE',
    sample: 'DEV-TS-M-BL,LEVEL_A,15000',
  },
  customer_order: {
    file: 'b2b-customer-order-template.csv',
    header: 'SKU,QTY',
    sample: 'DEV-TS-M-BL,2',
  },
};

/** Downloadable CSV templates (OPEN-18: a documented template with sample rows). */
export const GET = apiRoute<{ type: string }>(async (_req, ctx: RouteContext<{ type: string }>) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.IMPORT_PREVIEW);
  const { type } = await ctx.params;
  const t = TEMPLATES[type];
  if (!t) throw errors.notFound('Unknown template');
  return new NextResponse(`﻿${t.header}\n${t.sample}\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${t.file}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});

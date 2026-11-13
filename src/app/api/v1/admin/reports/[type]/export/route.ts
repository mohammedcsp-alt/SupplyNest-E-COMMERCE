import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { apiRoute, clientIp, type RouteContext } from '@/lib/api';
import { errors } from '@/lib/errors';
import { db } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { canSeePrices } from '@/modules/admin/access';
import { buildReport, parseReportFilters, parseReportType, sha256Hex, toCsv, toXlsx } from '@/modules/admin/reports';

export const dynamic = 'force-dynamic';

/**
 * Streams the SAME query as the JSON view as XLSX or CSV (UTF-8 with BOM). Each export writes a ReportExport row
 * and an audit row with the checksum of the delivered file. PDF is produced by the printable page, not here.
 */
export const GET = apiRoute<{ type: string }>(async (req, ctx: RouteContext<{ type: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.REPORT_EXPORT);
  const type = parseReportType((await ctx.params).type);
  const format = req.nextUrl.searchParams.get('format') ?? 'csv';
  if (format !== 'xlsx' && format !== 'csv') throw errors.validation('format must be xlsx or csv');
  const filters = parseReportFilters(req.nextUrl.searchParams);
  const canPrice = canSeePrices(actor);
  const result = await buildReport(type, filters, canPrice);
  if (result.truncated) throw errors.validation('Report exceeds the export limit. Narrow the date range or filters.');

  const file = format === 'xlsx' ? await toXlsx(result) : toCsv(result);
  const checksum = sha256Hex(file);
  await db.$transaction(async (tx) => {
    await tx.reportExport.create({
      data: { actorId: actor.id, reportType: type, format, filters: filters as Prisma.InputJsonValue, rowCount: result.rowCount, checksum },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'report.export',
      entityType: 'report',
      entityId: type,
      after: { format, rowCount: result.rowCount, checksum, filters, includesPrices: canPrice },
      ip: clientIp(req),
    });
  });

  const filename = `b2b-${type}-${new Date().toISOString().slice(0, 10)}.${format}`;
  const contentType = format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8';
  return new NextResponse(new Uint8Array(file), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(file.length),
      'Cache-Control': 'private, no-store',
      'X-Report-Checksum-Sha256': checksum,
      'X-Request-Id': requestId,
    },
  });
});

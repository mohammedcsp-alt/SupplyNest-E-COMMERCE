import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { apiRoute, clientIp, type RouteContext } from '@/lib/api';
import { errors, AppError } from '@/lib/errors';
import { db } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { canSeePrices } from '@/modules/admin/access';
import { buildReport, parseReportFilters, parseReportType, sha256Hex, toCsv, toXlsx } from '@/modules/admin/reports';
import { PDF_MAX_ROWS, renderReportPdf } from '@/modules/admin/reports-pdf';
import { CHROMIUM_INSTALL_HINT, PdfRendererUnavailableError } from '@/integrations/pdf/chromium';

export const dynamic = 'force-dynamic';

const CONTENT_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
} as const;

/**
 * Streams the SAME query as the JSON view as XLSX, CSV (UTF-8 with BOM) or PDF.
 * PDF is the printable report page rendered by a local Chromium with the caller's own session. It needs both
 * report.export and report.view, and is limited to PDF_MAX_ROWS rows.
 * Each export writes a ReportExport row and an audit row with the checksum of the delivered file.
 */
export const GET = apiRoute<{ type: string }>(async (req, ctx: RouteContext<{ type: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.REPORT_EXPORT);
  const type = parseReportType((await ctx.params).type);
  const format = req.nextUrl.searchParams.get('format') ?? 'csv';
  if (format !== 'xlsx' && format !== 'csv' && format !== 'pdf') throw errors.validation('format must be xlsx, csv or pdf');
  if (format === 'pdf') requirePermission(actor, PERMISSIONS.REPORT_VIEW);
  const filters = parseReportFilters(req.nextUrl.searchParams);
  const canPrice = canSeePrices(actor);
  const result = await buildReport(type, filters, canPrice);
  if (result.truncated) throw errors.validation('Report exceeds the export limit. Narrow the date range or filters.');
  if (format === 'pdf' && result.rowCount > PDF_MAX_ROWS) {
    throw errors.validation(`PDF export is limited to ${PDF_MAX_ROWS} rows. Use XLSX or CSV, or narrow the filters.`);
  }

  let file: Buffer;
  if (format === 'pdf') {
    try {
      file = await renderReportPdf({ type, filters, cookieHeader: req.headers.get('cookie') });
    } catch (err) {
      if (err instanceof PdfRendererUnavailableError) {
        // 503: the service cannot produce PDFs on this machine. No fake PDF is ever returned.
        return NextResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: `PDF export is unavailable. ${CHROMIUM_INSTALL_HINT}` }, requestId },
          { status: 503, headers: { 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId } },
        );
      }
      throw new AppError('INTERNAL_ERROR', 'The PDF could not be generated. Try again, or use XLSX or CSV.');
    }
  } else {
    file = format === 'xlsx' ? await toXlsx(result) : toCsv(result);
  }

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
  return new NextResponse(new Uint8Array(file), {
    status: 200,
    headers: {
      'Content-Type': CONTENT_TYPES[format],
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(file.length),
      'Cache-Control': 'private, no-store',
      'X-Report-Checksum-Sha256': checksum,
      'X-Request-Id': requestId,
    },
  });
});

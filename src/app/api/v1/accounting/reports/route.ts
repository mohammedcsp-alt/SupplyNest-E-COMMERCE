import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { Workbook } from 'exceljs';
import type { Prisma } from '@prisma/client';
import { apiRoute, ok } from '@/lib/api';
import { errors } from '@/lib/errors';
import { db } from '@/lib/db';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { REPORT_TYPES, buildReport, rangeDate, type ReportResult, type ReportType } from '@/modules/accounting/views';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Accounting reports. format=json needs finance.view (preview). xlsx and csv need report.export and are recorded
 * as ReportExport rows with a sha256 checksum of the delivered file.
 */
export const GET = apiRoute(async (req, _ctx, requestId) => {
  const sp = req.nextUrl.searchParams;
  const type = sp.get('type') ?? '';
  if (!(REPORT_TYPES as readonly string[]).includes(type)) throw errors.validation('type must be couriers, customers, orders or periods');
  const format = sp.get('format') ?? 'json';
  if (format !== 'json' && format !== 'xlsx' && format !== 'csv') throw errors.validation('format must be json, xlsx or csv');

  const user = await getCurrentUser();
  const actor = format === 'json' ? requirePermission(user, PERMISSIONS.FINANCE_VIEW) : requirePermission(user, PERMISSIONS.REPORT_EXPORT);

  const fromRaw = sp.get('from');
  const toRaw = sp.get('to');
  const from = rangeDate(fromRaw, 'start');
  const to = rangeDate(toRaw, 'end');
  if (fromRaw && !from) throw errors.validation('Invalid from date');
  if (toRaw && !to) throw errors.validation('Invalid to date');
  const courierId = sp.get('courierId') || undefined;
  const customerId = sp.get('customerId') || undefined;
  if (courierId && !UUID.test(courierId)) throw errors.validation('Invalid courierId');
  if (customerId && !UUID.test(customerId)) throw errors.validation('Invalid customerId');

  const report = await buildReport(type as ReportType, { from, to, courierId, customerId });
  if (format === 'json') return ok(requestId, report, { meta: { rowCount: report.rows.length } });

  const buf = format === 'xlsx' ? await toXlsx(report) : toCsv(report);
  const checksum = createHash('sha256').update(buf).digest('hex');
  await db.reportExport.create({
    data: {
      actorId: actor.id,
      reportType: type,
      format,
      filters: { from: fromRaw ?? null, to: toRaw ?? null, courierId: courierId ?? null, customerId: customerId ?? null } as Prisma.InputJsonValue,
      rowCount: report.rows.length,
      checksum,
    },
  });
  const filename = `${type}-${new Date().toISOString().slice(0, 10)}.${format}`;
  const contentType = format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8';
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Report-Checksum': checksum,
      'X-Request-Id': requestId,
    },
  });
});

async function toXlsx(r: ReportResult): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet(r.type);
  ws.columns = r.columns.map((c) => ({ header: c.label.en, key: c.key, width: 22 }));
  const numeric = (kind: string) => kind === 'money' || kind === 'count';
  const toCell = (c: ReportResult['columns'][number], v: string | null | undefined) => {
    if (v === null || v === undefined) return null;
    return numeric(c.kind) ? Number(v) : v;
  };
  for (const row of r.rows) {
    ws.addRow(Object.fromEntries(r.columns.map((c) => [c.key, toCell(c, row[c.key])])));
  }
  const totals = Object.fromEntries(r.columns.map((c, i) => [c.key, i === 0 ? 'TOTAL' : toCell(c, r.totals[c.key])]));
  const totalRow = ws.addRow(totals);
  totalRow.font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function csvCell(v: string | null, kind: string): string {
  if (v === null) return '';
  let s = v;
  // Spreadsheet formula injection guard for free text.
  if (kind === 'text' && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with a UTF-8 BOM so Excel reads Arabic text correctly. */
function toCsv(r: ReportResult): Buffer {
  const header = r.columns.map((c) => csvCell(c.label.en, 'text')).join(',');
  const body = r.rows.map((row) => r.columns.map((c) => csvCell(row[c.key] ?? null, c.kind)).join(','));
  const totals = r.columns.map((c, i) => (i === 0 ? 'TOTAL' : csvCell(r.totals[c.key] ?? null, c.kind))).join(',');
  return Buffer.from(`﻿${[header, ...body, totals].join('\r\n')}\r\n`, 'utf8');
}

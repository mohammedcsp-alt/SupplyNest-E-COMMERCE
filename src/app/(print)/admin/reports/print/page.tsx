import { PageHeader, EmptyState, Alert } from '@/components/ui';
import { PERMISSIONS } from '@/lib/rbac';
import { AppError } from '@/lib/errors';
import { canSeePrices } from '@/modules/admin/access';
import { buildReport, parseReportFilters, parseReportType, REPORT_TYPE_LABELS, type ReportType } from '@/modules/admin/reports';
import { gatePage } from '@/app/admin/_lib/gate';
import { PrintButton } from '@/app/admin/_components/PrintButton';
import { ReportTable } from '@/app/admin/_components/ReportTable';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

/**
 * Printable view of one report. The browser's print dialog ("Save as PDF") produces the PDF; no server PDF is made.
 * Lives outside the admin sidebar layout so the printed page is clean.
 */
export default async function ReportPrint({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gatePage(PERMISSIONS.REPORT_VIEW, '/admin/reports');
  if (!g.ok) return g.node;
  const { L, locale, user } = g;
  const sp = await searchParams;
  const search = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === 'string') as Array<[string, string]>);
  let body: ReactNode;
  try {
    const type: ReportType = parseReportType(sp.type ?? '');
    const filters = parseReportFilters(search);
    const result = await buildReport(type, filters, canSeePrices(user));
    const label = locale === 'ar' ? REPORT_TYPE_LABELS[type].ar : REPORT_TYPE_LABELS[type].en;
    const filterText = Object.entries(filters)
      .filter(([, v]) => !!v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');
    body = (
      <>
        <PageHeader
          title={label}
          subtitle={`${L('عدد الصفوف', 'Rows')}: ${result.rowCount}${result.truncated ? '+' : ''} · ${L('طُبع في', 'Generated')}: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC${filterText ? ` · ${filterText}` : ''}`}
          actions={<PrintButton label={L('طباعة / حفظ كـ PDF', 'Print / Save as PDF')} />}
        />
        {result.rows.length === 0 ? <EmptyState>{L('لا توجد صفوف مطابقة.', 'No matching rows.')}</EmptyState> : <ReportTable result={result} locale={locale} limit={5000} />}
      </>
    );
  } catch (err) {
    body = <Alert tone="error">{err instanceof AppError ? err.message : L('تعذر إنشاء التقرير.', 'The report could not be built.')}</Alert>;
  }
  return (
    <>
      <style>{`@media print { .site-header, .site-footer, .dev-banner, .skip-link, .no-print { display: none !important; } .main { padding: 0 !important; } .table-wrap { border: 0; } table { font-size: 10pt; } th { background: #eee !important; } }`}</style>
      {body}
    </>
  );
}

import Link from 'next/link';
import { PageHeader, Card, EmptyState, Alert } from '@/components/ui';
import { PERMISSIONS } from '@/lib/rbac';
import { AppError } from '@/lib/errors';
import { db } from '@/lib/db';
import { canSeePrices } from '@/modules/admin/access';
import { buildReport, parseReportFilters, REPORT_TYPE_LABELS, type ReportFilters, type ReportResult, type ReportType } from '@/modules/admin/reports';
import { REPORT_TYPES_LIST } from '@/modules/admin/constants';
import { gatePage } from '../_lib/gate';
import { ReportTable } from '../_components/ReportTable';

export const dynamic = 'force-dynamic';

const PREVIEW_ROWS = 200;

function queryOf(type: string, f: ReportFilters, extra?: Record<string, string>): string {
  const sp = new URLSearchParams({ type, ...(extra ?? {}) });
  for (const [k, v] of Object.entries(f)) if (v) sp.set(k, v);
  return sp.toString();
}

export default async function AdminReports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const g = await gatePage(PERMISSIONS.REPORT_VIEW, '/admin/reports');
  if (!g.ok) return g.node;
  const { L, locale, user } = g;
  const sp = await searchParams;
  const typeRaw = sp.type ?? '';
  const type = (REPORT_TYPES_LIST as readonly string[]).includes(typeRaw) ? (typeRaw as ReportType) : null;
  const levels = await db.priceLevel.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
  const formParams = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => typeof v === 'string') as Array<[string, string]>,
  );

  let result: ReportResult | null = null;
  let filters: ReportFilters = {};
  let error: string | null = null;
  if (type) {
    try {
      filters = parseReportFilters(formParams);
      result = await buildReport(type, filters, canSeePrices(user));
    } catch (err) {
      error = err instanceof AppError ? err.message : L('تعذر إنشاء التقرير.', 'The report could not be built.');
    }
  }
  const canExport = user.permissions.has(PERMISSIONS.REPORT_EXPORT);
  const label = (t: ReportType) => (locale === 'ar' ? REPORT_TYPE_LABELS[t].ar : REPORT_TYPE_LABELS[t].en);

  return (
    <>
      <PageHeader
        title={L('التقارير', 'Reports')}
        subtitle={L('معاينة الجدول ثم التصدير إلى Excel أو CSV، أو الطباعة / الحفظ كـ PDF من المتصفح.', 'Preview the table, then export to Excel or CSV, or print / save as PDF from the browser.')}
      />
      <Card>
        <form method="GET" className="form-row" role="search">
          <div className="field">
            <label htmlFor="rep-type">{L('نوع التقرير', 'Report type')} *</label>
            <select id="rep-type" name="type" defaultValue={type ?? ''} required>
              <option value="">{L('اختر', 'Choose')}</option>
              {REPORT_TYPES_LIST.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rep-from">{L('من تاريخ', 'From date')}</label>
            <input id="rep-from" name="from" type="date" defaultValue={sp.from ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="rep-to">{L('إلى تاريخ', 'To date')}</label>
            <input id="rep-to" name="to" type="date" defaultValue={sp.to ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="rep-status">{L('الحالة (اختياري)', 'Status (optional)')}</label>
            <input id="rep-status" name="status" defaultValue={sp.status ?? ''} placeholder="SUBMITTED" dir="ltr" maxLength={40} />
          </div>
          <div className="field">
            <label htmlFor="rep-level">{L('مستوى السعر', 'Price level')}</label>
            <select id="rep-level" name="priceLevelId" defaultValue={sp.priceLevelId ?? ''}>
              <option value="">{L('الكل', 'All')}</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rep-customer">{L('معرّف العميل (UUID)', 'Customer ID (UUID)')}</label>
            <input id="rep-customer" name="customerId" defaultValue={sp.customerId ?? ''} dir="ltr" maxLength={36} />
          </div>
          <div className="field">
            <label htmlFor="rep-sku">{L('معرّف SKU (UUID)', 'SKU ID (UUID)')}</label>
            <input id="rep-sku" name="skuId" defaultValue={sp.skuId ?? ''} dir="ltr" maxLength={36} />
          </div>
          <div className="field">
            <button type="submit" className="btn btn-primary">{L('عرض التقرير', 'Show report')}</button>
          </div>
        </form>
        <p className="muted" style={{ marginBlockStart: 8 }}>
          {L('فلتر الحالة يعمل على الأنواع التي لها حالة (الطلبات، العملاء، الحجوزات، الاستيراد، المخزون: LOW_STOCK، المنتجات: PUBLISHED/UNPUBLISHED).', 'The status filter applies to types with a status (orders, customers, reservations, imports; inventory: LOW_STOCK; products: PUBLISHED / UNPUBLISHED).')}
        </p>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      {type && result && (
        <Card
          title={`${label(type)} — ${result.rowCount}${result.truncated ? '+' : ''} ${L('صف', 'rows')}`}
          actions={
            <span className="row">
              {canExport && (
                <>
                  <a className="btn btn-small" href={`/api/v1/admin/reports/${type}/export?${queryOf(type, filters, { format: 'xlsx' })}`}>
                    {L('تصدير Excel (XLSX)', 'Export XLSX')}
                  </a>
                  <a className="btn btn-small" href={`/api/v1/admin/reports/${type}/export?${queryOf(type, filters, { format: 'csv' })}`}>
                    {L('تصدير CSV', 'Export CSV')}
                  </a>
                </>
              )}
              <Link className="btn btn-small" href={`/admin/reports/print?${queryOf(type, filters)}`}>
                {L('طباعة / حفظ كـ PDF', 'Print / Save as PDF')}
              </Link>
            </span>
          }
        >
          {!canExport && <p className="muted">{L('التصدير يتطلب صلاحية report.export.', 'Export requires report.export.')}</p>}
          {!canSeePrices(user) && type !== 'prices' && <p className="muted">{L('أعمدة المبالغ مخفية لأنك لا تملك صلاحية price.view.', 'Money columns are hidden because you lack price.view.')}</p>}
          <ReportTable result={result} locale={locale} limit={PREVIEW_ROWS} />
          {result.rowCount > PREVIEW_ROWS && (
            <p className="muted">{L(`تُعرض أول ${PREVIEW_ROWS} صف. التصدير يحتوي على كل الصفوف.`, `Showing the first ${PREVIEW_ROWS} rows. Exports contain every row.`)}</p>
          )}
        </Card>
      )}
      {!type && <EmptyState>{L('اختر نوع التقرير ثم اضغط عرض.', 'Choose a report type and press Show.')}</EmptyState>}
    </>
  );
}

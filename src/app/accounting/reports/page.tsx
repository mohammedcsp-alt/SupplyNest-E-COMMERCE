import Link from 'next/link';
import { Alert, Card, EmptyState, ForbiddenNotice, LoginRequired, Money, PageHeader } from '@/components/ui';
import { fmtDateTime } from '@/components/ops';
import { currentLocale, localized } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/session';
import { userWithPermission } from '@/lib/page-guards';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { REPORT_TYPES, buildReport, rangeDate, type ReportType } from '@/modules/accounting/views';
import { AccountingNav } from '../AccountingNav';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | undefined>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREVIEW_LIMIT = 500;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const sp = await searchParams;
  const next = '/accounting/reports';

  if (!(await getCurrentUser())) return <LoginRequired locale={locale} next={next} />;
  const user = await userWithPermission(PERMISSIONS.FINANCE_VIEW);
  if (!user) return <ForbiddenNotice locale={locale} />;

  const type: ReportType = (REPORT_TYPES as readonly string[]).includes(sp.type ?? '') ? (sp.type as ReportType) : 'couriers';
  const fromRaw = sp.from ?? '';
  const toRaw = sp.to ?? '';
  const courierId = sp.courierId && UUID.test(sp.courierId) ? sp.courierId : undefined;
  const customerId = sp.customerId && UUID.test(sp.customerId) ? sp.customerId : undefined;
  const canExport = user.permissions.has(PERMISSIONS.REPORT_EXPORT);

  const hasQuery = Boolean(sp.type || fromRaw || toRaw);
  const report = hasQuery
    ? await buildReport(type, { from: rangeDate(fromRaw, 'start'), to: rangeDate(toRaw, 'end'), courierId, customerId })
    : null;
  const couriers = await db.courier.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });

  const typeLabels: Record<ReportType, string> = {
    couriers: L('الشركات (إجماليات منفصلة)', 'Couriers (separate totals)'),
    customers: L('أجور توصيل العملاء', 'Customer delivery fees'),
    orders: L('الشحنات (صف لكل شحنة)', 'Shipments (one row per shipment)'),
    periods: L('الفترات (يوم بتوقيت بغداد)', 'Periods (Baghdad day)'),
  };

  const exportQuery = new URLSearchParams();
  exportQuery.set('type', type);
  if (fromRaw) exportQuery.set('from', fromRaw);
  if (toRaw) exportQuery.set('to', toRaw);
  if (courierId) exportQuery.set('courierId', courierId);
  if (customerId) exportQuery.set('customerId', customerId);

  return (
    <section className="stack">
      <PageHeader title={L('التقارير', 'Reports')} subtitle={L('معاينة على الشاشة، والتصدير إلى Excel أو CSV للمستخدمين الذين يملكون صلاحية التصدير.', 'On-screen preview. Export to Excel or CSV requires the export permission.')} />
      <AccountingNav locale={locale} current="/accounting/reports" />

      <Card title={L('المرشحات', 'Filters')}>
        <form method="get" className="form-row">
          <div className="field">
            <label htmlFor="type">{L('نوع التقرير', 'Report type')}</label>
            <select id="type" name="type" defaultValue={type}>
              {REPORT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabels[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="from">{L('من', 'From')}</label>
            <input id="from" name="from" type="date" defaultValue={fromRaw} />
          </div>
          <div className="field">
            <label htmlFor="to">{L('إلى', 'To')}</label>
            <input id="to" name="to" type="date" defaultValue={toRaw} />
            <div className="field-help">{L('توقيت بغداد، شاملاً اليوم.', 'Baghdad time, inclusive.')}</div>
          </div>
          <div className="field">
            <label htmlFor="courierId">{L('الشركة (اختياري)', 'Courier (optional)')}</label>
            <select id="courierId" name="courierId" defaultValue={courierId ?? ''}>
              <option value="">{L('الكل', 'All')}</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="customerId">{L('معرّف العميل (اختياري)', 'Customer ID (optional)')}</label>
            <input id="customerId" name="customerId" type="text" dir="ltr" defaultValue={customerId ?? ''} />
            <div className="field-help">{L('للتقرير حسب العملاء فقط.', 'Used by the customers report only.')}</div>
          </div>
          <div className="field" style={{ alignSelf: 'end' }}>
            <button type="submit" className="btn btn-primary">
              {L('عرض المعاينة', 'Preview')}
            </button>
          </div>
        </form>
      </Card>

      {canExport && hasQuery && (
        <Card title={L('تصدير', 'Export')}>
          <div className="row">
            <a className="btn" href={`/api/v1/accounting/reports?${exportQuery.toString()}&format=xlsx`} download>
              {L('تحميل Excel (XLSX)', 'Download Excel (XLSX)')}
            </a>
            <a className="btn" href={`/api/v1/accounting/reports?${exportQuery.toString()}&format=csv`} download>
              {L('تحميل CSV', 'Download CSV')}
            </a>
          </div>
          <p className="field-help">{L('كل تصدير يُسجَّل بالمستخدم والمرشحات وعدد الصفوف وبصمة الملف.', 'Each export is recorded with the user, filters, row count and file checksum.')}</p>
        </Card>
      )}
      {!canExport && hasQuery && (
        <Alert tone="warn" role="status">{L('التصدير يتطلب صلاحية تصدير التقارير.', 'Export requires the report export permission.')}</Alert>
      )}

      {!report ? (
        <Card>
          <EmptyState>{L('اختر نوع التقرير والفترة ثم اضغط عرض المعاينة.', 'Choose a report type and period, then press Preview.')}</EmptyState>
        </Card>
      ) : (
        <Card title={`${typeLabels[report.type]} — ${L('الصفوف', 'rows')}: ${report.rows.length}`}>
          {report.rows.length > 0 && (
            <div className="fa-metric-grid" style={{ marginBlockEnd: 16 }}>
              {report.columns
                .filter((c) => c.kind === 'money')
                .map((c) => (
                  <div key={c.key} className="fa-metric is-info">
                    <span className="kpi-label">{locale === 'ar' ? c.label.ar : c.label.en}</span>
                    <span className="kpi">
                      <Money value={report.totals[c.key]} locale={locale} />
                    </span>
                  </div>
                ))}
            </div>
          )}
          {report.rows.length === 0 ? (
            <EmptyState>{L('لا توجد بيانات لهذه المرشحات.', 'No data for these filters.')}</EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {report.columns.map((c) => (
                      <th key={c.key} scope="col" className={c.kind === 'money' || c.kind === 'count' ? 'num' : undefined}>
                        {locale === 'ar' ? c.label.ar : c.label.en}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.slice(0, PREVIEW_LIMIT).map((row, i) => (
                    <tr key={i}>
                      {report.columns.map((c) => (
                        <td key={c.key} className={c.kind === 'money' || c.kind === 'count' ? 'num' : undefined}>
                          {c.kind === 'money' ? (
                            <Money value={row[c.key]} locale={locale} />
                          ) : c.kind === 'date' ? (
                            fmtDateTime(row[c.key], locale)
                          ) : (
                            <span dir={c.kind === 'text' && /^[0-9a-z-]+$/i.test(row[c.key] ?? '') ? 'ltr' : undefined}>{row[c.key] ?? '—'}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    {report.columns.map((c, i) => (
                      <th key={c.key} scope="row" className={c.kind === 'money' || c.kind === 'count' ? 'num' : undefined}>
                        {i === 0 ? L('الإجمالي', 'Total') : c.kind === 'money' ? <Money value={report.totals[c.key]} locale={locale} /> : c.kind === 'count' ? report.totals[c.key] ?? '—' : ''}
                      </th>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {report.rows.length > PREVIEW_LIMIT && (
            <p className="field-help">{L(`تُعرض أول ${PREVIEW_LIMIT} صف. التصدير يحتوي على الكل.`, `First ${PREVIEW_LIMIT} rows shown. The export contains all rows.`)}</p>
          )}
          <p className="field-help">{L('الإجماليات هي مجموع كل قيمة منفصلة. لا توجد أرقام مجمّعة مثل الربح.', 'Totals are sums of each separate value. No combined profit figures.')}</p>
        </Card>
      )}
    </section>
  );
}

import { Alert, Card, EmptyState, ForbiddenNotice, LoginRequired, Money, PageHeader } from '@/components/ui';
import { fmtDateTime } from '@/components/ops';
import { currentLocale, localized } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/session';
import { userWithPermission } from '@/lib/page-guards';
import { PERMISSIONS } from '@/lib/rbac';
import { customerFeesView, rangeDate } from '@/modules/accounting/views';
import { AccountingNav } from '../AccountingNav';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | undefined>;

export default async function CustomerFeesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const sp = await searchParams;
  const next = '/accounting/customers';

  if (!(await getCurrentUser())) return <LoginRequired locale={locale} next={next} />;
  const user = await userWithPermission(PERMISSIONS.FINANCE_VIEW);
  if (!user) return <ForbiddenNotice locale={locale} />;

  const from = rangeDate(sp.from, 'start');
  const to = rangeDate(sp.to, 'end');
  const { rows, total } = await customerFeesView({ from, to });

  return (
    <section className="stack">
      <PageHeader
        title={L('أجور توصيل العملاء', 'Customer delivery fees')}
        subtitle={L('ما يدفعه العميل مقابل التوصيل. هذا مبلغ منفصل عن أجر شركة التوصيل.', 'What customers pay for delivery. This is kept separate from the courier fee.')}
      />
      <AccountingNav locale={locale} current="/accounting/customers" />

      <Alert tone="warn" role="status">
        {L(
          'رسوم توصيل العميل لا تُجمع مع أجر شركة التوصيل. أجر الشركة يظهر في تقارير الشركات والشحنات.',
          'Customer delivery fees are never added to the courier fee. Courier fees appear in the courier and shipment reports.',
        )}
      </Alert>

      <Card title={L('الفترة', 'Period')}>
        <form method="get" className="form-row">
          <div className="field">
            <label htmlFor="from">{L('من', 'From')}</label>
            <input id="from" name="from" type="date" defaultValue={sp.from ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="to">{L('إلى', 'To')}</label>
            <input id="to" name="to" type="date" defaultValue={sp.to ?? ''} />
            <div className="field-help">{L('حسب تاريخ تقديم الطلب، توقيت بغداد.', 'By order submission date, Baghdad time.')}</div>
          </div>
          <div className="field" style={{ alignSelf: 'end' }}>
            <button type="submit" className="btn btn-primary">
              {L('عرض', 'Show')}
            </button>
          </div>
        </form>
      </Card>

      <Card title={L('الإجمالي', 'Total')}>
        <div className="fa-metric is-info">
          <span className="kpi-label">{L('رسوم توصيل العملاء (المجموع)', 'Customer delivery fees (total)')}</span>
          <span className="kpi">
            <Money value={total} locale={locale} />
          </span>
          <span className="fa-metric-hint">{L(`عدد الطلبات: ${rows.length}`, `Orders: ${rows.length}`)}</span>
        </div>
      </Card>

      <Card>
        {rows.length === 0 ? (
          <EmptyState>{L('لا توجد طلبات في هذه الفترة.', 'No orders in this period.')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{L('الطلب', 'Order')}</th>
                  <th scope="col">{L('العميل', 'Customer')}</th>
                  <th scope="col">{L('قُدّم', 'Submitted')}</th>
                  <th scope="col">{L('الحالة', 'Status')}</th>
                  <th scope="col">{L('سُلّم للشركة', 'Handed to courier')}</th>
                  <th scope="col" className="num">{L('رسوم التوصيل على العميل', 'Customer delivery fee')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.orderNumber}>
                    <td dir="ltr">{r.orderNumber}</td>
                    <td title={r.customerId}>{r.customerName}</td>
                    <td>{fmtDateTime(r.submittedAt, locale)}</td>
                    <td>{r.status.replace(/_/g, ' ')}</td>
                    <td>{r.handedOver ? L('نعم', 'Yes') : L('لا', 'No')}</td>
                    <td className="num"><Money value={r.deliveryFee} locale={locale} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}

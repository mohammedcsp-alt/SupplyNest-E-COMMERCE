import Link from 'next/link';
import { Alert, Card, EmptyState, ForbiddenNotice, LoginRequired, Money, PageHeader } from '@/components/ui';
import { currentLocale, localized } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/session';
import { userWithPermission } from '@/lib/page-guards';
import { PERMISSIONS } from '@/lib/rbac';
import { reconciliation } from '@/modules/accounting/service';
import { AccountingNav } from '../AccountingNav';

export const dynamic = 'force-dynamic';

export default async function ReconciliationPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const next = '/accounting/reconciliation';

  if (!(await getCurrentUser())) return <LoginRequired locale={locale} next={next} />;
  const user = await userWithPermission(PERMISSIONS.FINANCE_RECONCILE);
  if (!user) return <ForbiddenNotice locale={locale} />;

  const rec = await reconciliation();

  return (
    <section className="stack">
      <PageHeader title={L('المطابقة', 'Reconciliation')} subtitle={L('أربع قوائم منفصلة. لا تُدمج الفروقات في رقم واحد.', 'Four separate lists. Differences are never merged into one number.')} />
      <AccountingNav locale={locale} current="/accounting/reconciliation" />

      <div className="fa-metric-grid">
        <div className="fa-metric is-warn">
          <span className="kpi-label">{L('تحويلات غير مخصصة', 'Transfers not fully allocated')}</span>
          <span className="kpi" dir="ltr">{rec.unallocatedTransfers.length}</span>
        </div>
        <div className="fa-metric is-danger">
          <span className="kpi-label">{L('فروقات التحصيل', 'Collection variances')}</span>
          <span className="kpi" dir="ltr">{rec.collectionVariances.length}</span>
        </div>
        <div className="fa-metric is-warn">
          <span className="kpi-label">{L('شحنات بدون تحصيل مؤكد', 'Shipments without confirmed collection')}</span>
          <span className="kpi" dir="ltr">{rec.uncollectedShipments.length}</span>
        </div>
        <div className="fa-metric is-info">
          <span className="kpi-label">{L('التعديلات المسجلة', 'Adjustments recorded')}</span>
          <span className="kpi" dir="ltr">{rec.adjustmentsRecorded}</span>
        </div>
      </div>

      <Card title={L('1. تحويلات غير مخصصة بالكامل', '1. Transfers not fully allocated')}>
        {rec.unallocatedTransfers.length === 0 ? (
          <EmptyState>{L('لا توجد.', 'None.')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{L('الشركة', 'Courier')}</th>
                  <th scope="col">{L('المرجع', 'Reference')}</th>
                  <th scope="col" className="num">{L('المبلغ', 'Amount')}</th>
                  <th scope="col" className="num">{L('المخصص', 'Allocated')}</th>
                  <th scope="col" className="num">{L('المتبقي', 'Unallocated')}</th>
                </tr>
              </thead>
              <tbody>
                {rec.unallocatedTransfers.map((r) => (
                  <tr key={r.id}>
                    <td>{r.courier}</td>
                    <td>
                      <Link href="/accounting/remittances" dir="ltr">{r.reference}</Link>
                    </td>
                    <td className="num"><Money value={r.gross} locale={locale} /></td>
                    <td className="num"><Money value={r.allocated} locale={locale} /></td>
                    <td className="num"><Money value={r.unallocated} locale={locale} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={L('2. فروقات بين COD المتوقع والمحصّل', '2. Collected vs expected COD variances')}>
        {rec.collectionVariances.length === 0 ? (
          <EmptyState>{L('لا توجد فروقات.', 'No variances.')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{L('الطلب', 'Order')}</th>
                  <th scope="col">{L('الشركة', 'Courier')}</th>
                  <th scope="col" className="num">{L('المتوقع', 'Expected')}</th>
                  <th scope="col" className="num">{L('المحصّل', 'Collected')}</th>
                  <th scope="col" className="num">{L('الفرق', 'Variance')}</th>
                </tr>
              </thead>
              <tbody>
                {rec.collectionVariances.map((v) => (
                  <tr key={v.shipmentId}>
                    <td>
                      <Link href={`/accounting/shipments/${v.shipmentId}`} dir="ltr">{v.orderNumber}</Link>
                    </td>
                    <td>{v.courier}</td>
                    <td className="num"><Money value={v.expected} locale={locale} /></td>
                    <td className="num"><Money value={v.collected} locale={locale} /></td>
                    <td className="num"><Money value={v.variance} locale={locale} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={L('3. شحنات بانتظار تأكيد التحصيل', '3. Shipments awaiting collection confirmation')}>
        {rec.uncollectedShipments.length === 0 ? (
          <EmptyState>{L('لا توجد.', 'None.')}</EmptyState>
        ) : (
          <ul className="fa-timeline">
            {rec.uncollectedShipments.map((s) => (
              <li key={s.shipmentId}>
                <Link href={`/accounting/shipments/${s.shipmentId}`} dir="ltr">{s.orderNumber}</Link> — {s.courier}
              </li>
            ))}
          </ul>
        )}
        {rec.uncollectedShipments.length > 0 && (
          <Alert tone="warn" role="status">
            {L('هذه الشحنات لا تملك COD محصّلاً مؤكداً بعد، لذلك لا يوجد لها مستحق من الشركة.', 'These shipments have no confirmed collected COD yet, so no amount is due from the courier for them.')}
          </Alert>
        )}
      </Card>

      <Card title={L('4. التعديلات المسجلة', '4. Adjustments recorded')}>
        <p>
          {L('عدد القيود المالية المسجلة (بما فيها التصحيحات):', 'Number of posted financial entries (including corrections):')} <strong dir="ltr">{rec.adjustmentsRecorded}</strong>
        </p>
        <p className="field-help">{L('التعديلات تُفتح من صفحة الشحنة نفسها.', 'Adjustments are recorded from the shipment page.')}</p>
      </Card>
    </section>
  );
}

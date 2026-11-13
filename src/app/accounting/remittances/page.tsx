import Link from 'next/link';
import { ActionButton } from '@/components/forms';
import { Alert, Badge, Card, EmptyState, ForbiddenNotice, LoginRequired, Money, PageHeader } from '@/components/ui';
import { METHOD_LABEL, fmtDateTime, pick } from '@/components/ops';
import { currentLocale, localized } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/session';
import { userWithPermission } from '@/lib/page-guards';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { allocationCandidates, listRemittances } from '@/modules/accounting/views';
import { AccountingNav } from '../AccountingNav';
import { AllocationForm, type AllocationCandidate } from './AllocationForm';
import { RemittanceForm } from './RemittanceForm';

export const dynamic = 'force-dynamic';

export default async function RemittancesPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const next = '/accounting/remittances';

  if (!(await getCurrentUser())) return <LoginRequired locale={locale} next={next} />;
  const user = await userWithPermission(PERMISSIONS.FINANCE_VIEW);
  if (!user) return <ForbiddenNotice locale={locale} />;

  const canRecord = user.permissions.has(PERMISSIONS.FINANCE_REMITTANCE_RECORD);
  const canAllocate = user.permissions.has(PERMISSIONS.FINANCE_ALLOCATE);
  const [remittances, couriers] = await Promise.all([
    listRemittances(),
    db.courier.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  // Candidate shipments per courier (same courier only), computed once per courier.
  const candidatesByCourier = new Map<string, AllocationCandidate[]>();
  if (canAllocate) {
    const courierIds = [...new Set(remittances.filter((r) => r.unallocated !== '0').map((r) => r.courierId))];
    for (const cid of courierIds) candidatesByCourier.set(cid, await allocationCandidates(cid));
  }

  return (
    <section className="stack">
      <PageHeader
        title={L('التحويلات المستلمة', 'Transfers received')}
        subtitle={L('المال المستلم من الشركات. التحويل يُخصَّص لشحنات الشركة نفسها فقط. لا يُخصَّص مقابل COD المتوقع.', 'Money received from couriers. A transfer is allocated only to shipments of the same courier, never against expected COD.')}
      />
      <AccountingNav locale={locale} current="/accounting/remittances" />

      {canRecord ? (
        <Card title={L('تسجيل تحويل مستلم', 'Record a received transfer')}>
          <RemittanceForm couriers={couriers} locale={locale} />
        </Card>
      ) : (
        <Alert tone="warn" role="status">{L('لا تملك صلاحية تسجيل التحويلات.', 'You cannot record transfers.')}</Alert>
      )}

      <Card title={L('قائمة التحويلات', 'Transfer list')}>
        {remittances.length === 0 ? (
          <EmptyState>{L('لا توجد تحويلات.', 'No transfers.')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{L('استُلم', 'Received')}</th>
                  <th scope="col">{L('الشركة', 'Courier')}</th>
                  <th scope="col">{L('المرجع', 'Reference')}</th>
                  <th scope="col">{L('الطريقة', 'Method')}</th>
                  <th scope="col" className="num">{L('المبلغ', 'Amount')}</th>
                  <th scope="col" className="num">{L('المخصص', 'Allocated')}</th>
                  <th scope="col" className="num">{L('غير المخصص', 'Unallocated')}</th>
                </tr>
              </thead>
              <tbody>
                {remittances.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDateTime(r.receivedAt, locale)}</td>
                    <td>{r.courier}</td>
                    <td dir="ltr">{r.reference}</td>
                    <td>{pick(METHOD_LABEL[r.method], locale)}</td>
                    <td className="num"><Money value={r.gross} locale={locale} /></td>
                    <td className="num"><Money value={r.allocated} locale={locale} /></td>
                    <td className="num">
                      {r.unallocated === '0' ? <Badge tone="ok">0</Badge> : <Money value={r.unallocated} locale={locale} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canAllocate &&
        remittances
          .filter((r) => r.unallocated !== '0')
          .map((r) => {
            const candidates = candidatesByCourier.get(r.courierId) ?? [];
            return (
              <Card key={r.id} title={`${L('تخصيص التحويل', 'Allocate transfer')} ${r.reference} — ${r.courier}`}>
                {candidates.length === 0 ? (
                  <EmptyState>{L('لا توجد شحنات لهذه الشركة لديها مبلغ مستحق مؤكد للتخصيص.', 'No shipments of this courier have a confirmed amount due to allocate.')}</EmptyState>
                ) : (
                  <AllocationForm remittanceId={r.id} unallocated={r.unallocated} candidates={candidates} locale={locale} />
                )}
              </Card>
            );
          })}

      <Card title={L('التخصيصات الحالية (إلغاء الخطأ فقط)', 'Current allocations (void mistakes only)')}>
        {remittances.every((r) => r.allocations.length === 0) ? (
          <EmptyState>{L('لا توجد تخصيصات.', 'No allocations.')}</EmptyState>
        ) : (
          <ul style={{ paddingInlineStart: 18, lineHeight: 2 }}>
            {remittances.flatMap((r) =>
              r.allocations.map((a) => (
                <li key={a.id}>
                  <span dir="ltr">{r.reference}</span> → <Link href={`/accounting/shipments/${a.shipmentId}`} dir="ltr">{a.orderNumber}</Link>{' '}
                  <Money value={a.amount} locale={locale} />{' '}
                  {canAllocate && (
                    <ActionButton
                      endpoint={`/api/v1/accounting/allocations/${a.id}/void`}
                      label={L('إلغاء التخصيص', 'Void allocation')}
                      reasonLabel={L('سبب الإلغاء (3 أحرف على الأقل)', 'Reason for voiding (at least 3 characters)')}
                      confirmText={L('سيُلغى هذا التخصيص فقط.', 'Only this allocation is removed.')}
                      tone="danger"
                      idempotent
                    />
                  )}
                </li>
              )),
            )}
          </ul>
        )}
      </Card>
    </section>
  );
}

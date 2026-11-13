import Link from 'next/link';
import { Badge, Card, EmptyState, ForbiddenNotice, LoginRequired, Money, PageHeader } from '@/components/ui';
import { SETTLEMENT_LABEL, fmtDateTime, pick } from '@/components/ops';
import { currentLocale, localized } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/session';
import { userWithPermission } from '@/lib/page-guards';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { AccountingNav } from '../AccountingNav';
import { AgreementForm } from './AgreementForm';
import { CourierForm } from './CourierForm';

export const dynamic = 'force-dynamic';

export default async function CouriersPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);

  if (!(await getCurrentUser())) return <LoginRequired locale={locale} next="/accounting/couriers" />;
  const user = await userWithPermission(PERMISSIONS.FINANCE_VIEW);
  if (!user) return <ForbiddenNotice locale={locale} />;
  const canManage = user.permissions.has(PERMISSIONS.COURIER_MANAGE);

  const couriers = await db.courier.findMany({ orderBy: { name: 'asc' }, include: { agreements: { orderBy: { effectiveFrom: 'desc' } } } });
  const now = new Date();

  return (
    <section className="stack">
      <PageHeader title={L('شركات التوصيل والاتفاقيات', 'Couriers and agreements')} subtitle={L('كل شركة لها اتفاقيات بتواريخ سريان. الاتفاقية الحالية تُطبَّق عند التسليم.', 'Each courier has effective-dated agreements. The agreement in force at handover is snapshotted onto the shipment.')} />
      <AccountingNav locale={locale} current="/accounting/couriers" />

      <Card title={L('ما الفرق بين الطريقتين؟', 'What is the difference between the two methods?')}>
        <div className="stack">
          <div>
            <strong>{L('صافي (NET_DEDUCTION)', 'NET (NET_DEDUCTION)')}</strong>
            <p>
              {L(
                'الشركة تحصّل COD من العميل، تخصم أجرها منه، وتحوّل الباقي. لا توجد دفعة أجر منفصلة لهذه الشحنة.',
                'The courier collects COD from the customer, deducts its own fee, and transfers the rest. There is no separate fee payment for that shipment.',
              )}
            </p>
          </div>
          <div>
            <strong>{L('إجمالي (GROSS_REMITTANCE)', 'GROSS (GROSS_REMITTANCE)')}</strong>
            <p>
              {L(
                'الشركة تحوّل كامل COD دون خصم. أجر الشركة يُدفع منفصلاً عبر "دفعة أجور" ويُسجَّل كسجل مستقل.',
                'The courier transfers the full COD without deduction. Its fee is paid separately through a fee payment record.',
              )}
            </p>
          </div>
          <p className="field-help">
            {L(
              'طريقة التسوية تُثبَّت لكل شحنة عند التسليم للشركة (لقطة). الاتفاقيات لها تواريخ سريان، والاتفاقية المحددة للمحافظة تتقدم على العامة.',
              'The method is snapshotted per shipment at handover. Agreements are effective-dated, and a governorate-specific agreement takes precedence over a general one.',
            )}
          </p>
          <p className="field-help" dir="ltr">
            Net (NET_DEDUCTION): the courier collects COD, keeps its fee, transfers the balance. Gross (GROSS_REMITTANCE): the courier transfers the full COD and its fee is paid separately.
          </p>
        </div>
      </Card>

      <Card>
        {couriers.length === 0 ? (
          <EmptyState>{L('لا توجد شركات توصيل بعد.', 'No couriers yet.')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{L('الشركة', 'Courier')}</th>
                  <th scope="col">{L('نشطة', 'Active')}</th>
                  <th scope="col">{L('الاتفاقيات', 'Agreements')}</th>
                </tr>
              </thead>
              <tbody>
                {couriers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/accounting/couriers/${c.id}`}>{c.name}</Link>
                    </td>
                    <td>{c.active ? <Badge tone="ok">{L('نعم', 'Yes')}</Badge> : <Badge tone="danger">{L('لا', 'No')}</Badge>}</td>
                    <td>
                      {c.agreements.length === 0 ? (
                        <span className="muted">{L('لا توجد اتفاقية', 'No agreement')}</span>
                      ) : (
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th scope="col">{L('الطريقة', 'Method')}</th>
                                <th scope="col">{L('ساري من', 'From')}</th>
                                <th scope="col">{L('حتى', 'Until')}</th>
                                <th scope="col" className="num">{L('أجر الشركة', 'Courier fee')}</th>
                                <th scope="col" className="num">{L('أجر الإرجاع', 'Return fee')}</th>
                                <th scope="col">{L('الحالة', 'State')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.agreements.map((a) => {
                                const current = a.active && a.effectiveFrom <= now && (!a.effectiveTo || a.effectiveTo > now);
                                return (
                                  <tr key={a.id}>
                                    <td>{pick(SETTLEMENT_LABEL[a.settlementMode], locale).split(' — ')[0]}</td>
                                    <td>{fmtDateTime(a.effectiveFrom, locale)}</td>
                                    <td>{a.effectiveTo ? fmtDateTime(a.effectiveTo, locale) : L('مفتوح', 'Open')}</td>
                                    <td className="num"><Money value={a.serviceFee.toFixed(0)} locale={locale} /></td>
                                    <td className="num"><Money value={a.returnFee.toFixed(0)} locale={locale} /></td>
                                    <td>{current ? <Badge tone="ok">{L('سارية', 'In force')}</Badge> : <Badge>{L('غير سارية', 'Not in force')}</Badge>}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canManage && (
        <div className="card-grid">
          <Card title={L('إضافة شركة', 'Add courier')}>
            <CourierForm locale={locale} />
          </Card>
          <Card title={L('إضافة اتفاقية', 'Add agreement')}>
            <AgreementForm couriers={couriers.map((c) => ({ id: c.id, name: c.name }))} locale={locale} />
            <p className="field-help">{L('الاتفاقيات لا تُحذف ولا تُعدّل؛ أضف اتفاقية جديدة بتاريخ سريان جديد.', 'Agreements are not edited or deleted; add a new one with a new effective date.')}</p>
          </Card>
        </div>
      )}
    </section>
  );
}

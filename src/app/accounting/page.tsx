import Link from 'next/link';
import { Alert, Card, ForbiddenNotice, LoginRequired, PageHeader } from '@/components/ui';
import { currentLocale, localized } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/session';
import { userWithPermission } from '@/lib/page-guards';
import { PERMISSIONS } from '@/lib/rbac';
import { db } from '@/lib/db';
import { reconciliation } from '@/modules/accounting/service';
import { AccountingNav } from './AccountingNav';

export const dynamic = 'force-dynamic';

export default async function AccountingDashboard() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);

  if (!(await getCurrentUser())) return <LoginRequired locale={locale} next="/accounting" />;
  const user = await userWithPermission(PERMISSIONS.FINANCE_VIEW);
  if (!user) return <ForbiddenNotice locale={locale} />;

  const canReconcile = user.permissions.has(PERMISSIONS.FINANCE_RECONCILE);
  const [courierCount, rec] = await Promise.all([
    db.courier.count({ where: { active: true } }),
    canReconcile ? reconciliation() : Promise.resolve(null),
  ]);

  const tiles: Array<{ href: string; label: string; value: string; hint: string }> = [
    { href: '/accounting/couriers', label: L('شركات التوصيل النشطة', 'Active couriers'), value: String(courierCount), hint: L('الاتفاقيات والتسوية', 'Agreements and settlement') },
    {
      href: '/accounting/reconciliation',
      label: L('شحنات بانتظار تأكيد التحصيل', 'Shipments awaiting collection'),
      value: rec ? String(rec.uncollectedShipments.length) : '—',
      hint: L('لم يُسجَّل تحصيل COD بعد', 'No collected COD recorded yet'),
    },
    {
      href: '/accounting/remittances',
      label: L('تحويلات غير مخصصة', 'Transfers not fully allocated'),
      value: rec ? String(rec.unallocatedTransfers.length) : '—',
      hint: L('مبلغ التحويل المتبقي بعد التخصيص', 'Transfer amount left after allocation'),
    },
    {
      href: '/accounting/reconciliation',
      label: L('فروقات التحصيل', 'Collection variances'),
      value: rec ? String(rec.collectionVariances.length) : '—',
      hint: L('المحصّل يختلف عن COD المتوقع', 'Collected differs from expected COD'),
    },
    {
      href: '/accounting/reconciliation',
      label: L('التعديلات المسجلة', 'Adjustments recorded'),
      value: rec ? String(rec.adjustmentsRecorded) : '—',
      hint: L('الرفض والمرتجع والخصم والتصحيح', 'Rejections, returns, discounts and corrections'),
    },
  ];

  return (
    <section className="stack">
      <PageHeader title={L('الحسابات', 'Accounting')} subtitle={L('تسوية COD مع شركات التوصيل. قيم منفصلة دائماً.', 'COD settlement with couriers. Values are always shown separately.')} />
      <AccountingNav locale={locale} current="/accounting" />

      <Alert tone="warn" role="status">
        {L(
          'COD المتوقع ليس نقداً مستلماً. لا يُعرض التحصيل إلا بعد تأكيد الشركة له. أجر الشركة وأجر توصيل العميل قيمتان منفصلتان.',
          'Expected COD is not cash received. Collection is shown only after the courier confirms it. Courier fee and customer delivery fee are separate values.',
        )}
      </Alert>

      {!canReconcile && (
        <Alert tone="warn" role="status">
          {L('بعض الأرقام تظهر بعد صلاحية المطابقة.', 'Some counts appear with the reconciliation permission.')}
        </Alert>
      )}

      <div className="card-grid">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="kpi-label">{t.label}</div>
            <div className="kpi" dir="ltr">{t.value}</div>
            <div className="muted" style={{ fontSize: '0.9rem' }}>{t.hint}</div>
          </Link>
        ))}
      </div>

      <Card title={L('الصفحات', 'Pages')}>
        <ul style={{ paddingInlineStart: 18, lineHeight: 2 }}>
          <li><Link href="/accounting/couriers">{L('شركات التوصيل والاتفاقيات', 'Couriers and agreements')}</Link></li>
          <li><Link href="/accounting/shipments">{L('الشحنات وتأكيد التحصيل والتعديلات', 'Shipments, collection and adjustments')}</Link></li>
          <li><Link href="/accounting/remittances">{L('التحويلات المستلمة والتخصيص', 'Transfers received and allocation')}</Link></li>
          <li><Link href="/accounting/reconciliation">{L('المطابقة', 'Reconciliation')}</Link></li>
          <li><Link href="/accounting/reports">{L('التقارير والتصدير', 'Reports and exports')}</Link></li>
          <li><Link href="/accounting/customers">{L('أجور توصيل العملاء', 'Customer delivery fees')}</Link></li>
        </ul>
      </Card>
    </section>
  );
}

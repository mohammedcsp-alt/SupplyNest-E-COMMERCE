import Link from 'next/link';
import { PageHeader, Card, Badge } from '@/components/ui';
import { PERMISSIONS } from '@/lib/rbac';
import { gatePage } from './_lib/gate';
import { getDashboardKpis } from '@/modules/admin/dashboard';
import { ALERT_TYPES_LIST } from '@/modules/admin/constants';
import { timezoneLabel } from '@/modules/admin/time';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const g = await gatePage('', '/admin');
  if (!g.ok) return g.node;
  const { L, locale } = g;
  const k = await getDashboardKpis();
  const alertCount = (t: string) => k.alerts.find((a) => a.type === t)?.count ?? 0;
  const areas: Array<{ href: string; ar: string; en: string; perm: string }> = [
    { href: '/admin/customers', ar: 'العملاء والموافقات', en: 'Customers and approvals', perm: PERMISSIONS.CUSTOMER_VIEW },
    { href: '/admin/catalog', ar: 'الكتالوج والأسعار', en: 'Catalog and prices', perm: PERMISSIONS.CATALOG_VIEW },
    { href: '/admin/imports', ar: 'استيراد الملفات', en: 'File imports', perm: PERMISSIONS.IMPORT_PREVIEW },
    { href: '/admin/inventory', ar: 'المخزون والتنبيهات', en: 'Inventory and alerts', perm: PERMISSIONS.INVENTORY_VIEW },
    { href: '/admin/reservations', ar: 'الحجوزات', en: 'Reservations', perm: PERMISSIONS.RESERVATION_VIEW },
    { href: '/admin/orders', ar: 'الطلبات', en: 'Orders', perm: PERMISSIONS.ORDER_VIEW },
    { href: '/admin/shipping', ar: 'الشحن', en: 'Shipping', perm: PERMISSIONS.SHIPPING_MANAGE },
    { href: '/admin/roles', ar: 'الأدوار والموظفون', en: 'Roles and staff', perm: PERMISSIONS.ROLE_MANAGE },
    { href: '/admin/audit', ar: 'سجل التدقيق', en: 'Audit log', perm: PERMISSIONS.AUDIT_VIEW },
    { href: '/admin/cms', ar: 'المحتوى', en: 'Content', perm: PERMISSIONS.CONTENT_EDIT },
    { href: '/admin/reports', ar: 'التقارير', en: 'Reports', perm: PERMISSIONS.REPORT_VIEW },
    { href: '/admin/settings', ar: 'الإعدادات', en: 'Settings', perm: PERMISSIONS.SETTINGS_MANAGE },
    { href: '/admin/backup', ar: 'النسخ الاحتياطي', en: 'Backup', perm: PERMISSIONS.BACKUP_MANAGE },
    { href: '/admin/integrations', ar: 'التكاملات', en: 'Integrations', perm: PERMISSIONS.INTEGRATION_VIEW },
  ];
  const kpis: Array<{ label: string; value: number }> = [
    { label: L('طلبات اليوم', 'Orders submitted today'), value: k.ordersToday },
    { label: L('إجمالي الطلبات', 'Orders (total)'), value: k.ordersTotal },
    { label: L('عملاء بانتظار الموافقة', 'Customers pending approval'), value: k.pendingApproval },
    { label: L('عملاء نشطون', 'Active customers'), value: k.activeCustomers },
    { label: L('حجوزات تحتاج مراجعة', 'Reservations in review'), value: k.reviewReservations },
    { label: L('استيرادات مرفوضة هذا الأسبوع', 'Imports rejected or invalid (7 days)'), value: k.rejectedImports },
  ];
  return (
    <>
      <PageHeader
        title={L('لوحة الإدارة', 'Administration dashboard')}
        subtitle={L(`الأرقام محسوبة مباشرة من قاعدة البيانات (التوقيت: ${timezoneLabel()}). لا تعرض الأرباح أو الإيرادات المحصلة في V1.`, `Live counts from the database (timezone ${timezoneLabel()}). Profit and collected revenue are not shown in V1.`)}
      />
      <div className="card-grid">
        {kpis.map((c) => (
          <Card key={c.label}>
            <div className="kpi">{c.value.toLocaleString(locale === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-US')}</div>
            <div className="kpi-label">{c.label}</div>
          </Card>
        ))}
      </div>
      <Card title={L('التنبيهات المفتوحة للمخزون', 'Open inventory alerts')}>
        <p className="muted">{L('التنبيهات معلوماتية فقط ولا يمكن حلها يدوياً من هذه الشاشة.', 'Alerts are informational; they cannot be resolved manually here.')}</p>
        <div className="row">
          {ALERT_TYPES_LIST.map((t) => (
            <span key={t} className="row" style={{ gap: 6 }}>
              <Badge tone={alertCount(t) > 0 ? 'warn' : 'neutral'}>{t.replace(/_/g, ' ')}</Badge>
              <strong>{alertCount(t)}</strong>
            </span>
          ))}
        </div>
      </Card>
      <Card title={L('المناطق الإدارية', 'Administration areas')}>
        <div className="card-grid" style={{ gap: 10 }}>
          {areas
            .filter((a) => g.user.permissions.has(a.perm))
            .map((a) => (
              <Link key={a.href} href={a.href} className="card admin-area-tile" style={{ marginBlockEnd: 0 }}>
                <strong>{L(a.ar, a.en)}</strong>
              </Link>
            ))}
        </div>
      </Card>
    </>
  );
}

import Link from 'next/link';
import type { ReactNode } from 'react';
import { currentLocale, localized } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

/** Area navigation. Each link is shown only when the viewer holds the matching permission (UI hint; pages enforce). */
const NAV: Array<{ href: string; ar: string; en: string; perm?: string }> = [
  { href: '/admin', ar: 'لوحة التحكم', en: 'Dashboard' },
  { href: '/admin/customers', ar: 'العملاء', en: 'Customers', perm: PERMISSIONS.CUSTOMER_VIEW },
  { href: '/admin/catalog', ar: 'الكتالوج', en: 'Catalog', perm: PERMISSIONS.CATALOG_VIEW },
  { href: '/admin/merchandising', ar: 'المنتجات المميزة', en: 'Featured products', perm: PERMISSIONS.CATALOG_VIEW },
  { href: '/admin/categories', ar: 'الفئات والعلامات', en: 'Categories & brands', perm: PERMISSIONS.CATALOG_VIEW },
  { href: '/admin/imports', ar: 'الاستيراد', en: 'Imports', perm: PERMISSIONS.IMPORT_PREVIEW },
  { href: '/admin/inventory', ar: 'المخزون', en: 'Inventory', perm: PERMISSIONS.INVENTORY_VIEW },
  { href: '/admin/reservations', ar: 'الحجوزات', en: 'Reservations', perm: PERMISSIONS.RESERVATION_VIEW },
  { href: '/admin/orders', ar: 'الطلبات', en: 'Orders', perm: PERMISSIONS.ORDER_VIEW },
  { href: '/admin/shipping', ar: 'الشحن', en: 'Shipping', perm: PERMISSIONS.SHIPPING_MANAGE },
  { href: '/admin/roles', ar: 'الأدوار والموظفون', en: 'Roles & staff', perm: PERMISSIONS.ROLE_MANAGE },
  { href: '/admin/audit', ar: 'سجل التدقيق', en: 'Audit log', perm: PERMISSIONS.AUDIT_VIEW },
  { href: '/admin/cms', ar: 'المحتوى', en: 'Content (CMS)', perm: PERMISSIONS.CONTENT_EDIT },
  { href: '/admin/reports', ar: 'التقارير', en: 'Reports', perm: PERMISSIONS.REPORT_VIEW },
  { href: '/admin/settings', ar: 'الإعدادات', en: 'Settings', perm: PERMISSIONS.SETTINGS_MANAGE },
  { href: '/admin/backup', ar: 'النسخ الاحتياطي', en: 'Backup', perm: PERMISSIONS.BACKUP_MANAGE },
  { href: '/admin/integrations', ar: 'التكاملات (WMS)', en: 'Integrations (WMS)', perm: PERMISSIONS.INTEGRATION_VIEW },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const locale = await currentLocale();
  const user = await getCurrentUser();
  if (!user || !user.permissions.has(PERMISSIONS.ADMIN_ACCESS)) return <>{children}</>;
  const links = NAV.filter((n) => !n.perm || user.permissions.has(n.perm));
  const label = localized(locale, 'قائمة الإدارة', 'Administration menu');
  return (
    <div className="layout-split">
      <nav className="sidebar admin-sidebar" aria-label={label}>
        <strong style={{ display: 'block', padding: '6px' }}>{localized(locale, 'الإدارة', 'Administration')}</strong>
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            {localized(locale, l.ar, l.en)}
          </Link>
        ))}
      </nav>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

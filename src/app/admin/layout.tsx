import Link from 'next/link';
import type { ReactNode } from 'react';
import { currentLocale, localized } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import './admin.css';

export const dynamic = 'force-dynamic';

type NavItem = { href: string; ar: string; en: string; perm?: string };
type NavGroup = { key: string; ar: string; en: string; items: NavItem[] };

/**
 * Administration navigation (AD-01), grouped by work area. Each link is shown only when the viewer holds the matching
 * permission (UI hint only; every page and API still enforces the permission). Groups with no visible link are hidden.
 * Groups are native <details> elements, so they collapse and expand without JavaScript.
 */
const GROUPS: NavGroup[] = [
  {
    key: 'operations',
    ar: 'العمليات',
    en: 'Operations',
    items: [
      { href: '/admin/orders', ar: 'الطلبات', en: 'Orders', perm: PERMISSIONS.ORDER_VIEW },
      { href: '/admin/reservations', ar: 'الحجوزات', en: 'Reservations', perm: PERMISSIONS.RESERVATION_VIEW },
      { href: '/admin/inventory', ar: 'المخزون', en: 'Inventory', perm: PERMISSIONS.INVENTORY_VIEW },
      { href: '/admin/shipping', ar: 'الشحن', en: 'Shipping', perm: PERMISSIONS.SHIPPING_MANAGE },
    ],
  },
  {
    key: 'catalog',
    ar: 'الكتالوج',
    en: 'Catalogue',
    items: [
      { href: '/admin/catalog', ar: 'المنتجات والأصناف', en: 'Products & SKUs', perm: PERMISSIONS.CATALOG_VIEW },
      { href: '/admin/merchandising', ar: 'المنتجات المميزة', en: 'Featured products', perm: PERMISSIONS.CATALOG_VIEW },
      { href: '/admin/categories', ar: 'الفئات والعلامات', en: 'Categories & brands', perm: PERMISSIONS.CATALOG_VIEW },
      { href: '/admin/imports', ar: 'الاستيراد', en: 'Imports', perm: PERMISSIONS.IMPORT_PREVIEW },
    ],
  },
  {
    key: 'customers',
    ar: 'العملاء',
    en: 'Customers',
    items: [{ href: '/admin/customers', ar: 'العملاء والموافقات', en: 'Customers & approvals', perm: PERMISSIONS.CUSTOMER_VIEW }],
  },
  {
    key: 'content',
    ar: 'المحتوى والتقارير',
    en: 'Content & reports',
    items: [
      { href: '/admin/cms', ar: 'المحتوى', en: 'Content (CMS)', perm: PERMISSIONS.CONTENT_EDIT },
      { href: '/admin/reports', ar: 'التقارير', en: 'Reports', perm: PERMISSIONS.REPORT_VIEW },
    ],
  },
  {
    key: 'administration',
    ar: 'الإدارة',
    en: 'Administration',
    items: [
      { href: '/admin/roles', ar: 'الأدوار والموظفون', en: 'Roles & staff', perm: PERMISSIONS.ROLE_MANAGE },
      { href: '/admin/audit', ar: 'سجل التدقيق', en: 'Audit log', perm: PERMISSIONS.AUDIT_VIEW },
      { href: '/admin/settings', ar: 'الإعدادات', en: 'Settings', perm: PERMISSIONS.SETTINGS_MANAGE },
      { href: '/admin/backup', ar: 'النسخ الاحتياطي', en: 'Backup', perm: PERMISSIONS.BACKUP_MANAGE },
      { href: '/admin/integrations', ar: 'التكاملات (WMS)', en: 'Integrations (WMS)', perm: PERMISSIONS.INTEGRATION_VIEW },
    ],
  },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const locale = await currentLocale();
  const user = await getCurrentUser();
  if (!user || !user.permissions.has(PERMISSIONS.ADMIN_ACCESS)) return <>{children}</>;
  const label = localized(locale, 'قائمة الإدارة', 'Administration menu');
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || user.permissions.has(i.perm)) })).filter((g) => g.items.length > 0);
  return (
    <div className="admin-layout">
      <nav className="admin-nav" aria-label={label}>
        <Link className="admin-nav-home" href="/admin">
          {localized(locale, 'لوحة التحكم', 'Dashboard')}
        </Link>
        {groups.map((g) => (
          <details key={g.key} className="admin-nav-group" open>
            <summary>{localized(locale, g.ar, g.en)}</summary>
            <ul>
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href}>{localized(locale, i.ar, i.en)}</Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </nav>
      <div className="admin-main" style={{ minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

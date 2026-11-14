import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Loc } from './shared';

type NavKey = 'home' | 'profile' | 'addresses' | 'favorites' | 'recent' | 'orders' | 'notifications';

const ITEMS: Array<{ key: NavKey; href: string; ar: string; en: string; customerOnly: boolean }> = [
  { key: 'home', href: '/account', ar: 'حسابي', en: 'Overview', customerOnly: false },
  { key: 'profile', href: '/account/profile', ar: 'الملف الشخصي', en: 'Profile', customerOnly: true },
  { key: 'addresses', href: '/account/addresses', ar: 'عناويني', en: 'Addresses', customerOnly: true },
  { key: 'orders', href: '/orders', ar: 'طلباتي', en: 'My orders', customerOnly: true },
  { key: 'favorites', href: '/account/favorites', ar: 'المفضلة', en: 'Favorites', customerOnly: true },
  { key: 'recent', href: '/account/recent', ar: 'تمت مشاهدتها مؤخرًا', en: 'Recently viewed', customerOnly: true },
  { key: 'notifications', href: '/account/notifications', ar: 'الإشعارات', en: 'Notifications', customerOnly: false },
];

/**
 * Shared frame for customer account pages (CU-10 to CU-15): breadcrumb plus side navigation.
 * On narrow screens the navigation becomes a horizontal strip. Presentation only; each page keeps its own data.
 */
export function AccountShell({ locale, current, isCustomer, children }: { locale: Loc; current: NavKey; isCustomer: boolean; children: ReactNode }) {
  const ar = locale === 'ar';
  const L = (a: string, e: string) => (ar ? a : e);
  const items = ITEMS.filter((i) => !i.customerOnly || isCustomer);
  const currentItem = items.find((i) => i.key === current);
  return (
    <section className="stack" style={{ marginBlockStart: 0 }}>
      <nav className="crumbs" aria-label={L('مسار التصفح', 'Breadcrumb')}>
        <Link href="/">{L('الرئيسية', 'Home')}</Link>
        <span aria-hidden="true">›</span>
        {current === 'home' ? (
          <span aria-current="page">{L('حسابي', 'My account')}</span>
        ) : (
          <>
            <Link href="/account">{L('حسابي', 'My account')}</Link>
            <span aria-hidden="true">›</span>
            <span aria-current="page">{currentItem ? L(currentItem.ar, currentItem.en) : ''}</span>
          </>
        )}
      </nav>
      <div className="account-layout">
        <nav className="account-nav" aria-label={L('قائمة الحساب', 'Account menu')}>
          {items.map((i) => (
            <Link key={i.key} href={i.href} className={`account-nav-link${i.key === current ? ' is-current' : ''}`} aria-current={i.key === current ? 'page' : undefined}>
              {L(i.ar, i.en)}
            </Link>
          ))}
        </nav>
        <div className="account-main stack">{children}</div>
      </div>
    </section>
  );
}

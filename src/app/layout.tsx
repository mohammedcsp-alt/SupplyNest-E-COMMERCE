import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { currentLocale, dirOf, messagesFor, localized } from '@/lib/i18n';
import { getCurrentUser, can } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { LanguageToggle } from '@/components/LanguageToggle';
import { LogoutButton } from '@/components/LogoutButton';
import { DevBanner } from '@/components/DevBanner';

export const metadata: Metadata = {
  title: 'B2B Trade Platform',
  description: 'Wholesale catalog of physical goods (local V1)',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await currentLocale();
  const t = messagesFor(locale);
  const user = await getCurrentUser();
  const dir = dirOf(locale);

  const showAdmin = can(user, PERMISSIONS.ADMIN_ACCESS);
  const showFulfillment = can(user, PERMISSIONS.FULFILLMENT_VIEW);
  const showFinance = can(user, PERMISSIONS.FINANCE_VIEW);
  const isCustomer = user?.userType === 'CUSTOMER' && user.status === 'ACTIVE';

  return (
    <html lang={locale} dir={dir} data-locale={locale}>
      <body>
        <a className="skip-link" href="#main">
          {locale === 'ar' ? 'انتقل إلى المحتوى' : 'Skip to content'}
        </a>
        <DevBanner locale={locale} />
        <header className="site-header">
          <div className="container header-row">
            <Link href="/" className="brand">
              {t.brand}
            </Link>
            <nav aria-label={locale === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'} className="main-nav">
              <Link href="/catalog">{t.nav.catalog}</Link>
              <Link href="/search">{t.nav.search}</Link>
              {isCustomer && <Link href="/cart">{t.nav.cart}</Link>}
              {isCustomer && <Link href="/orders">{t.nav.orders}</Link>}
              {user && <Link href="/account">{t.nav.account}</Link>}
              {showFulfillment && <Link href="/fulfillment">{t.nav.fulfillment}</Link>}
              {showFinance && <Link href="/accounting">{t.nav.accounting}</Link>}
              {showAdmin && <Link href="/admin">{t.nav.admin}</Link>}
            </nav>
            <div className="header-actions">
              <LanguageToggle current={locale} label={t.nav.language} />
              {user ? (
                <>
                  <span className="user-chip" title={user.phone}>
                    {user.displayName}
                  </span>
                  <LogoutButton label={t.nav.logout} />
                </>
              ) : (
                <>
                  <Link href="/login">{t.nav.login}</Link>
                  <Link href="/register" className="btn btn-primary btn-small">
                    {t.nav.register}
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>
        <main id="main" className="container main">
          {children}
        </main>
        <footer className="site-footer">
          <div className="container footer-row">
            <span>{localized(locale, 'المنصة محلية للتطوير — V1', 'Local development build — V1')}</span>
            <nav aria-label={locale === 'ar' ? 'روابط الصفحات' : 'Content pages'}>
              <Link href="/p/about">{locale === 'ar' ? 'من نحن' : 'About'}</Link> ·{' '}
              <Link href="/p/privacy">{locale === 'ar' ? 'الخصوصية' : 'Privacy'}</Link> ·{' '}
              <Link href="/p/terms">{locale === 'ar' ? 'الشروط' : 'Terms'}</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}

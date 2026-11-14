import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { currentLocale, dirOf, messagesFor, localized } from '@/lib/i18n';
import { getCurrentUser, can } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { storefront } from '@/lib/storefront-config';
import { categoryTree } from '@/modules/catalog/public';
import { cartLineCount } from '@/modules/commerce/cart';
import { db } from '@/lib/db';
import { LanguageToggle } from '@/components/LanguageToggle';
import { LogoutButton } from '@/components/LogoutButton';
import { DevBanner } from '@/components/DevBanner';
import { HeaderSearch } from '@/components/storefront/HeaderSearch';
import { NavToggle } from '@/components/storefront/NavToggle';
import { IconUser, IconHeart, IconOrders, IconCart } from '@/components/storefront/Icons';

export const metadata: Metadata = {
  title: 'SupplyNest — B2B wholesale',
  description: 'Wholesale catalogue of physical goods',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const dynamic = 'force-dynamic';

type CatNode = Awaited<ReturnType<typeof categoryTree>>[number];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await currentLocale();
  const t = messagesFor(locale);
  const user = await getCurrentUser();
  const dir = dirOf(locale);
  const ar = locale === 'ar';
  const L = (a: string, e: string) => localized(locale, a, e);

  const showAdmin = can(user, PERMISSIONS.ADMIN_ACCESS);
  const showFulfillment = can(user, PERMISSIONS.FULFILLMENT_VIEW);
  const showFinance = can(user, PERMISSIONS.FINANCE_VIEW);
  const isCustomer = user?.userType === 'CUSTOMER' && user.status === 'ACTIVE';
  const cartCount = isCustomer && user ? await cartLineCount(db, user.id) : 0;

  // Category menu: top two levels from the database (dynamic, unlimited depth in data; the menu shows two levels).
  const categories: CatNode[] = await categoryTree();
  const companyName = L(storefront.companyNameAr, storefront.companyNameEn);
  const year = new Date().getFullYear();

  return (
    <html lang={locale} dir={dir} data-locale={locale}>
      <body>
        <a className="skip-link" href="#main">
          {L('انتقل إلى المحتوى', 'Skip to content')}
        </a>
        <DevBanner locale={locale} />

        <header className="site-header">
          <div className="top-bar">
            <div className="container">
              {storefront.showAnnouncement && <span className="announce">{L(storefront.announcementAr, storefront.announcementEn)}</span>}
              <div className="support">
                {storefront.supportPhone && (
                  <a href={`tel:${storefront.supportPhone.replace(/\s/g, '')}`} dir="ltr">
                    {storefront.supportPhone}
                  </a>
                )}
                {storefront.supportEmail && <a href={`mailto:${storefront.supportEmail}`}>{storefront.supportEmail}</a>}
                <Link href="/p/about">{L('الدعم والمساعدة', 'Help & support')}</Link>
              </div>
              <div className="lang-switch">
                <LanguageToggle current={locale} label={t.nav.language} />
              </div>
            </div>
          </div>

          <div className="main-bar">
            <div className="container">
              <Link href="/" className="brand" aria-label={companyName}>
                {storefront.logoPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={storefront.logoPath} alt="" className="brand-logo" />
                ) : (
                  <span className="brand-mark" aria-hidden="true">
                    {storefront.companyNameEn.charAt(0).toUpperCase()}
                  </span>
                )}
                <span>{companyName}</span>
              </Link>

              <HeaderSearch
                locale={locale}
                placeholder={L('ابحث بالاسم أو SKU أو العلامة أو الفئة', 'Search by name, SKU, brand or category')}
                buttonLabel={L('بحث', 'Search')}
              />

              <div className="header-actions">
                {user ? (
                  <>
                    <Link href="/account" title={user.phone}>
                      <IconUser />
                      <span className="label">{user.displayName}</span>
                    </Link>
                    {isCustomer && (
                      <Link href="/account/favorites">
                        <IconHeart />
                        <span className="label hide-md">{L('المفضلة', 'Favourites')}</span>
                      </Link>
                    )}
                    {isCustomer && (
                      <Link href="/orders">
                        <IconOrders />
                        <span className="label hide-md">{t.nav.orders}</span>
                      </Link>
                    )}
                    {isCustomer && (
                      <Link href="/cart" aria-label={L(`السلة، ${cartCount} صنف`, `Cart, ${cartCount} lines`)}>
                        <IconCart />
                        <span className="label">{t.nav.cart}</span>
                        {cartCount > 0 && <span className="count">{cartCount}</span>}
                      </Link>
                    )}
                    <LogoutButton label={t.nav.logout} />
                  </>
                ) : (
                  <>
                    <Link href="/login">
                      <IconUser />
                      <span className="label">{t.nav.login}</span>
                    </Link>
                    <Link href="/register" className="btn btn-accent btn-small">
                      {t.nav.register}
                    </Link>
                  </>
                )}
              </div>
              <NavToggle labelOpen={L('القائمة', 'Menu')} labelClose={L('إغلاق', 'Close')} />
            </div>
          </div>

          <div className="category-bar" id="category-bar">
            <div className="container">
              <details className="all-categories">
                <summary>☰ {L('جميع الفئات', 'All categories')}</summary>
                <div className="mega" role="menu">
                  {categories.length === 0 && <span className="muted">{L('لا توجد فئات بعد', 'No categories yet')}</span>}
                  {categories.map((c) => (
                    <div key={c.id}>
                      <Link href={`/catalog?categoryId=${c.id}`} className="parent">
                        {L(c.nameAr, c.nameEn)}
                      </Link>
                      {c.children.map((s) => (
                        <span key={s.id} className="sub">
                          <Link href={`/catalog?categoryId=${s.id}`}>{L(s.nameAr, s.nameEn)}</Link>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </details>

              <nav aria-label={L('التنقل الرئيسي', 'Main navigation')} className="category-nav">
                {categories.slice(0, 6).map((c) => (
                  <Link key={c.id} href={`/catalog?categoryId=${c.id}`}>
                    {L(c.nameAr, c.nameEn)}
                  </Link>
                ))}
                <Link href="/catalog?sort=newest" className="hot">
                  {L('وصل حديثًا', 'New arrivals')}
                </Link>
                <Link href="/catalog">{t.nav.catalog}</Link>
                {isCustomer && (
                  <Link href="/bulk-order">{L('طلب بالجملة', 'Bulk order')}</Link>
                )}
                {isCustomer && (
                  <Link href="/bulk-order">{L('رفع ملف Excel', 'Excel order upload')}</Link>
                )}
                {isCustomer && (
                  <Link href="/cart" className="quick">
                    {L('طلب سريع', 'Quick order')}
                  </Link>
                )}
                {showFulfillment && <Link href="/fulfillment">{t.nav.fulfillment}</Link>}
                {showFinance && <Link href="/accounting">{t.nav.accounting}</Link>}
                {showAdmin && <Link href="/admin">{t.nav.admin}</Link>}
              </nav>
            </div>
          </div>
        </header>

        <main id="main" className="container main">
          {children}
        </main>

        <footer className="site-footer">
          <div className="container footer-grid">
            <div>
              <h2>{companyName}</h2>
              <p className="muted" style={{ fontSize: '0.9rem' }}>
                {L(
                  'منصة بيع بالجملة للمنتجات المادية. الأسعار والتوفر يظهران للعملاء المعتمدين فقط.',
                  'Wholesale platform for physical goods. Prices and availability are shown to approved customers only.',
                )}
              </p>
              {(storefront.supportPhone || storefront.supportEmail) && (
                <p className="muted" style={{ fontSize: '0.9rem' }}>
                  {storefront.supportPhone && <span dir="ltr">{storefront.supportPhone}</span>}
                  {storefront.supportPhone && storefront.supportEmail && ' · '}
                  {storefront.supportEmail}
                </p>
              )}
            </div>
            <div>
              <h2>{L('الكتالوج', 'Catalogue')}</h2>
              <ul>
                <li><Link href="/catalog">{L('كل المنتجات', 'All products')}</Link></li>
                <li><Link href="/catalog?sort=newest">{L('وصل حديثًا', 'New arrivals')}</Link></li>
                <li><Link href="/search">{L('بحث متقدم', 'Advanced search')}</Link></li>
              </ul>
            </div>
            <div>
              <h2>{L('حسابي', 'My account')}</h2>
              <ul>
                {user ? <li><Link href="/account">{L('الملف الشخصي', 'Profile')}</Link></li> : <li><Link href="/login">{t.nav.login}</Link></li>}
                {user ? <li><Link href="/orders">{t.nav.orders}</Link></li> : <li><Link href="/register">{L('تسجيل حساب جملة', 'Register a wholesale account')}</Link></li>}
                <li><Link href="/recover">{L('استعادة الوصول', 'Account recovery')}</Link></li>
              </ul>
            </div>
            <div>
              <h2>{L('معلومات', 'Information')}</h2>
              <ul>
                <li><Link href="/p/about">{L('من نحن', 'About')}</Link></li>
                <li><Link href="/p/privacy">{L('الخصوصية', 'Privacy')}</Link></li>
                <li><Link href="/p/terms">{L('الشروط', 'Terms')}</Link></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <div className="container">
              <span>
                © {year} {companyName}. {L('جميع الحقوق محفوظة.', 'All rights reserved.')}
              </span>
              <span>{L('نسخة تطوير محلية — V3.3', 'Local development build — V3.3')}</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

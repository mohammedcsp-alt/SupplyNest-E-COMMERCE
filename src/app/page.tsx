import Link from 'next/link';
import { currentLocale, localized } from '@/lib/i18n';
import { getCurrentUser, canSeePrices, canOrder, viewerOf } from '@/lib/session';
import { listCatalog, categoryTree, projectSkusForViewer } from '@/modules/catalog/public';
import { catalogFacets } from '@/modules/catalog/facets';
import { listCmsBanners } from '@/modules/admin/cms';
import { db } from '@/lib/db';
import { EmptyState } from '@/components/ui';
import { ProductCard, type CardItem } from '@/components/storefront/ProductCard';
import { categoryImageSrc } from '@/lib/storefront-config';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const user = await getCurrentUser();
  const viewer = viewerOf(user);
  const priced = canSeePrices(user);
  const buyable = canOrder(user);
  const isCustomer = user?.userType === 'CUSTOMER';
  const now = new Date();

  const [tree, facets, newest, banners] = await Promise.all([
    categoryTree(),
    catalogFacets(),
    listCatalog({ sort: 'newest', page: 1, pageSize: 8 }, viewer),
    listCmsBanners(),
  ]);

  // Recently viewed: only for active customers (the same rule as the product page).
  let recent: CardItem[] = [];
  let favoriteSkus = new Set<string>();
  if (isCustomer && user) {
    const [rv, favs] = await Promise.all([
      db.recentView.findMany({ where: { customerId: user.id }, orderBy: { viewedAt: 'desc' }, take: 8, select: { sku: { select: { sku: true } } } }),
      db.favorite.findMany({ where: { customerId: user.id }, select: { sku: { select: { sku: true } } } }),
    ]);
    favoriteSkus = new Set(favs.map((f) => f.sku.sku));
    if (rv.length) {
      const order = new Map(rv.map((r, i) => [r.sku.sku, i]));
      recent = (await projectSkusForViewer(rv.map((r) => r.sku.sku), viewer)) as CardItem[];
      recent.sort((a, b) => (order.get(a.sku) ?? 0) - (order.get(b.sku) ?? 0));
    }
  }

  const banner = banners.find((b) => b.active && (!b.activeFrom || b.activeFrom <= now) && (!b.activeTo || b.activeTo >= now));
  const topCategories = tree.slice(0, 12);
  const cardViewer = { locale, canSeePrice: priced, canBuy: buyable, canFavorite: isCustomer, favoriteSkus };

  return (
    <div>
      {/* Hero + promo tiles */}
      <section className="home-hero" aria-label={L('الواجهة الرئيسية', 'Featured')}>
        <div className={`hero-banner${banner ? ' has-image' : ''}`}>
          {banner && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="hero-img" src={`/api/v1/cms/banners/${banner.id}/image`} alt="" aria-hidden="true" />
          )}
          <h1>{banner ? localized(locale, banner.titleAr, banner.titleEn) : L('كتالوج الجملة للمنتجات المادية', 'Wholesale catalogue for physical goods')}</h1>
          <p>
            {L(
              'تصفّح الفئات والعلامات التجارية، وأضف الكميات إلى السلة. تظهر أسعار الجملة لحسابك بعد اعتماده.',
              'Browse categories and brands, and add quantities to your cart. Your wholesale prices appear once your account is approved.',
            )}
          </p>
          <div className="row">
            <Link className="btn btn-accent" href={banner ? banner.targetPath : '/catalog'}>
              {banner ? L('عرض العرض', 'View offer') : L('تصفح الكتالوج', 'Browse catalogue')}
            </Link>
            {!user && (
              <Link className="btn" href="/register" style={{ background: 'transparent', color: '#fff', borderColor: 'rgb(255 255 255 / 50%)' }}>
                {L('تسجيل حساب جملة', 'Register for wholesale')}
              </Link>
            )}
          </div>
        </div>
        <div className="hero-side">
          <Link href={isCustomer ? '/bulk-order' : '/login'} className="promo-tile">
            <strong>{L('طلب سريع وبالجملة', 'Quick and bulk ordering')}</strong>
            <span>{L('أدخل SKU والكمية أو ارفع ملف Excel.', 'Enter SKUs and quantities, or upload an Excel file.')}</span>
          </Link>
          <Link href="/catalog?sort=newest" className="promo-tile">
            <strong>{L('وصل حديثًا', 'New arrivals')}</strong>
            <span>{L('أحدث المنتجات المضافة إلى الكتالوج.', 'The most recently added products.')}</span>
          </Link>
        </div>
      </section>

      {/* Account status notice */}
      {user && !priced && user.status === 'APPROVAL_PENDING' && (
        <div className="alert alert-warn" style={{ marginBlockStart: 16 }}>
          {L(
            'حسابك بانتظار موافقة الإدارة. لا تظهر الأسعار ولا يمكن إرسال الطلبات حتى التفعيل.',
            'Your account is awaiting administrator approval. Prices and ordering are unavailable until activation.',
          )}
        </div>
      )}

      {/* Categories */}
      <section aria-labelledby="home-cats">
        <div className="section-head">
          <h2 id="home-cats">{L('تصفح حسب الفئة', 'Shop by category')}</h2>
          <Link href="/catalog">{L('كل الفئات', 'All categories')} →</Link>
        </div>
        {topCategories.length === 0 ? (
          <EmptyState>{L('لا توجد فئات منشورة بعد.', 'No categories have been published yet.')}</EmptyState>
        ) : (
          <div className="category-cards">
            {topCategories.map((c) => {
              const name = localized(locale, c.nameAr, c.nameEn);
              return (
                <Link key={c.id} href={`/catalog?categoryId=${c.id}`} className="category-card">
                  {categoryImageSrc(c.slug) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="cat-img" src={categoryImageSrc(c.slug)!} alt="" loading="lazy" />
                  ) : (
                    <span className="cat-icon" aria-hidden="true">
                      {name.trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                  <strong>{name}</strong>
                  <span>{c.children.length > 0 ? L(`${c.children.length} فئات فرعية`, `${c.children.length} subcategories`) : L('تصفح المنتجات', 'Browse products')}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Brands (only brands that have published products) */}
      {facets.brands.length > 0 && (
        <section aria-labelledby="home-brands">
          <div className="section-head">
            <h2 id="home-brands">{L('العلامات التجارية', 'Brands')}</h2>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {facets.brands.slice(0, 12).map((b) => (
              <Link key={b.id} href={`/catalog?brand=${b.id}`} className="badge" style={{ fontSize: '0.9rem', padding: '6px 12px', textDecoration: 'none' }}>
                {b.name} <span className="muted">({b.count})</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Quick order entry point */}
      {isCustomer ? (
        <div className="quick-order-entry">
          <div>
            <h2>{L('طلب سريع', 'Quick order')}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {L('أدخل رموز SKU والكميات مباشرة، أو ارفع ملف Excel لإضافة عدة أصناف إلى السلة دفعة واحدة.', 'Enter SKUs and quantities directly, or upload an Excel file to add several items to your cart at once.')}
            </p>
          </div>
          <div className="row">
            <Link className="btn btn-primary" href="/bulk-order">
              {L('ابدأ الطلب', 'Start an order')}
            </Link>
          </div>
        </div>
      ) : null}

      {/* New arrivals */}
      <section aria-labelledby="home-new">
        <div className="section-head">
          <h2 id="home-new">{L('وصل حديثًا', 'New arrivals')}</h2>
          <Link href="/catalog?sort=newest">{L('عرض الكل', 'View all')} →</Link>
        </div>
        {newest.items.length === 0 ? (
          <EmptyState>{L('لا توجد منتجات منشورة بعد.', 'No products have been published yet.')}</EmptyState>
        ) : (
          <div className="product-grid" role="list">
            {(newest.items as CardItem[]).map((it) => (
              <div role="listitem" key={it.id}>
                <ProductCard item={it} v={cardViewer} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recently viewed (customers) */}
      {recent.length > 0 && (
        <section aria-labelledby="home-recent">
          <div className="section-head">
            <h2 id="home-recent">{L('شوهد مؤخرًا', 'Recently viewed')}</h2>
            <Link href="/account/recent">{L('كل المشاهدات', 'All recently viewed')} →</Link>
          </div>
          <div className="product-grid" role="list">
            {recent.slice(0, 6).map((it) => (
              <div role="listitem" key={it.id}>
                <ProductCard item={it} v={cardViewer} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Wholesale registration */}
      {!user && (
        <section className="wholesale-cta" aria-labelledby="home-register">
          <div>
            <h2 id="home-register">{L('سجّل حساب جملة', 'Open a wholesale account')}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {L(
                'بعد مراجعة الطلب وموافقة الإدارة، تظهر لك أسعار الجملة المخصصة لمستواك وتتاح لك الطلبات الجماعية.',
                'After review and administrator approval, your assigned wholesale price tier is shown and bulk ordering is enabled.',
              )}
            </p>
          </div>
          <div className="row">
            <Link className="btn btn-accent" href="/register">
              {L('تسجيل', 'Register')}
            </Link>
            <Link className="btn" href="/login">
              {L('تسجيل الدخول', 'Sign in')}
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

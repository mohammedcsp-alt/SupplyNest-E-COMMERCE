import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentLocale, localized } from '@/lib/i18n';
import { getCurrentUser, viewerOf, canSeePrices, canOrder } from '@/lib/session';
import { getPublicSku } from '@/modules/catalog/public';
import { AppError } from '@/lib/errors';
import { Money, StatusBadge } from '@/components/ui';
import { QuickAdd } from '@/components/storefront/QuickAdd';
import { ProductGallery } from '@/components/storefront/ProductGallery';
import { ProductCard, availabilityLabel, type CardItem } from '@/components/storefront/ProductCard';
import { ProductCustomerActions } from '@/components/customer/ProductCustomerActions';
import { db } from '@/lib/db';
import { formatIqd } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function ProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const locale = await currentLocale();
  const { sku } = await params;
  const user = await getCurrentUser();
  let detail;
  try {
    detail = await getPublicSku(decodeURIComponent(sku), viewerOf(user));
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_FOUND') notFound();
    throw err;
  }
  const { item, qualityVariants, related } = detail;
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const name = localized(locale, item.nameAr, item.nameEn);
  const priced = canSeePrices(user);
  const buyable = canOrder(user);
  const price = (item as { price?: { amount: string } }).price;
  const available = item.availability === 'AVAILABLE';
  const isCustomer = user?.userType === 'CUSTOMER';
  const description = localized(locale, item.descriptionAr, item.descriptionEn);
  const favorite = isCustomer && user
    ? !!(await db.favorite.findUnique({ where: { customerId_skuId: { customerId: user.id, skuId: item.id } }, select: { skuId: true } }))
    : false;

  // Breadcrumb: the category path from the database (the first two levels are enough for the storefront trail).
  const cat = await db.category.findUnique({ where: { id: item.category.id }, select: { id: true, parentId: true, nameAr: true, nameEn: true, slug: true } });
  const parent = cat?.parentId ? await db.category.findUnique({ where: { id: cat.parentId }, select: { id: true, nameAr: true, nameEn: true } }) : null;

  const cardViewer = {
    locale,
    canSeePrice: priced,
    canBuy: buyable,
    canFavorite: isCustomer,
    favoriteSkus: new Set<string>(),
  };

  return (
    <div className="stack" style={{ marginBlockStart: 0 }}>
      <nav className="crumbs" aria-label={L('مسار التصفح', 'Breadcrumb')}>
        <Link href="/">{L('الرئيسية', 'Home')}</Link>
        <span aria-hidden="true">›</span>
        <Link href="/catalog">{L('الكتالوج', 'Catalogue')}</Link>
        {parent && (
          <>
            <span aria-hidden="true">›</span>
            <Link href={`/catalog?categoryId=${parent.id}`}>{localized(locale, parent.nameAr, parent.nameEn)}</Link>
          </>
        )}
        {cat && (
          <>
            <span aria-hidden="true">›</span>
            <Link href={`/catalog?categoryId=${cat.id}`}>{localized(locale, cat.nameAr, cat.nameEn)}</Link>
          </>
        )}
        <span aria-hidden="true">›</span>
        <span aria-current="page">{name}</span>
      </nav>

      <div className="pdp">
        <ProductGallery images={item.images} alt={name} locale={locale} />

        <div className="pdp-info">
          <div className="row" style={{ gap: 6 }}>
            <StatusBadge status={item.availability} />
            {item.quality && <span className="badge">{localized(locale, item.quality.nameAr, item.quality.nameEn)}</span>}
          </div>
          <h1>{name}</h1>
          <dl className="kv" style={{ margin: 0 }}>
            <dt>SKU</dt>
            <dd dir="ltr" style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>
              {item.sku}
            </dd>
            {item.brand && (
              <>
                <dt>{L('العلامة التجارية', 'Brand')}</dt>
                <dd>{item.brand.name}</dd>
              </>
            )}
            {cat && (
              <>
                <dt>{L('الفئة', 'Category')}</dt>
                <dd>{localized(locale, cat.nameAr, cat.nameEn)}</dd>
              </>
            )}
            {item.model && (
              <>
                <dt>{L('الموديل', 'Model')}</dt>
                <dd>{item.model.name}</dd>
              </>
            )}
            <dt>{L('الوحدة', 'Unit')}</dt>
            <dd>{item.unit}</dd>
          </dl>

          <div className="pdp-buy">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {availabilityLabel(item.availability, locale)}
              </span>
              {priced && price ? (
                <span className="price">
                  <Money value={price.amount} locale={locale} />
                </span>
              ) : (
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  {priced ? L('لا يوجد سعر لمستواك لهذا الصنف.', 'No price for your level on this item.') : L('السعر للعملاء المعتمدين', 'Price for approved customers')}
                </span>
              )}
            </div>

            {buyable && available && price ? (
              <>
                <QuickAdd sku={item.sku} locale={locale} />
                <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                  {L('السعر للوحدة', 'Unit price')}: {formatIqd(price.amount, locale)}
                </p>
              </>
            ) : !user ? (
              <Link className="btn btn-primary btn-block" href={`/login?next=${encodeURIComponent(`/products/${item.sku}`)}`}>
                {L('سجّل الدخول للطلب', 'Sign in to order')}
              </Link>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                {available ? L('غير متاح للطلب حاليًا.', 'Not orderable right now.') : L('غير متوفر حاليًا.', 'Currently unavailable.')}
              </p>
            )}

            {isCustomer && user && (
              <ProductCustomerActions sku={item.sku} locale={locale} recordView={user.status === 'ACTIVE'} initialFavorite={favorite} />
            )}
          </div>
        </div>
      </div>

      <div className="layout-split" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
        <div className="stack">
          {description && (
            <section className="card" aria-labelledby="pdp-desc">
              <h2 id="pdp-desc" style={{ fontSize: '1.05rem' }}>{L('الوصف', 'Description')}</h2>
              <p style={{ whiteSpace: 'pre-line' }}>{description}</p>
            </section>
          )}
          {item.attributes.length > 0 && (
            <section className="card" aria-labelledby="pdp-spec">
              <h2 id="pdp-spec" style={{ fontSize: '1.05rem' }}>{L('المواصفات', 'Specifications')}</h2>
              <div className="table-wrap" style={{ margin: 0 }}>
                <table className="spec-table">
                  <tbody>
                    {item.attributes.map((a) => (
                      <tr key={a.key}>
                        <th scope="row">{localized(locale, a.labelAr, a.labelEn)}</th>
                        <td>
                          {a.value}
                          {a.unit ? ` ${a.unit}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {qualityVariants.length > 1 && (
            <section className="card" aria-labelledby="pdp-var">
              <h2 id="pdp-var" style={{ fontSize: '1.05rem' }}>{L('الجودات المتاحة لهذا الموديل', 'Qualities for this model')}</h2>
              <div className="table-wrap" style={{ margin: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>{L('الجودة', 'Quality')}</th>
                      <th>{L('التوفر', 'Availability')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qualityVariants.map((v) => (
                      <tr key={v.id}>
                        <td dir="ltr">
                          <Link href={`/products/${encodeURIComponent(v.sku)}`}>{v.sku}</Link>
                        </td>
                        <td>{v.quality ? localized(locale, v.quality.nameAr, v.quality.nameEn) : '—'}</td>
                        <td>
                          <StatusBadge status={v.availability} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
        <aside className="stack">
          <section className="card" aria-labelledby="pdp-help">
            <h2 id="pdp-help" style={{ fontSize: '1rem' }}>{L('طلب بالجملة', 'Wholesale ordering')}</h2>
            <p className="muted" style={{ fontSize: '0.88rem' }}>
              {L(
                'للكميات الكبيرة استخدم الطلب بالجملة أو رفع ملف Excel. تُراجع الأسعار والمخزون عند الإضافة وعند تأكيد الطلب.',
                'For large quantities use bulk order or Excel upload. Prices and stock are re-checked when you add items and when you place the order.',
              )}
            </p>
            <Link href="/bulk-order" className="btn btn-small">
              {L('فتح الطلب بالجملة', 'Open bulk order')}
            </Link>
          </section>
        </aside>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="pdp-related" className="related-strip">
          <div className="section-head">
            <h2 id="pdp-related">{L('منتجات ذات صلة', 'Related products')}</h2>
          </div>
          <div className="product-grid" role="list">
            {(related as CardItem[]).slice(0, 8).map((r) => (
              <div role="listitem" key={r.id}>
                <ProductCard item={r} v={cardViewer} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

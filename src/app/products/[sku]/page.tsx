import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentLocale, localized } from '@/lib/i18n';
import { getCurrentUser, viewerOf, canSeePrices, canOrder } from '@/lib/session';
import { getPublicSku } from '@/modules/catalog/public';
import { AppError } from '@/lib/errors';
import { Card, Money, StatusBadge, PageHeader } from '@/components/ui';
import { AddToCart } from '@/components/AddToCart';
import { ProductCustomerActions } from '@/components/customer/ProductCustomerActions';
import { db } from '@/lib/db';

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
  const price = (item as { price?: { amount: string } }).price;
  const available = item.availability === 'AVAILABLE';

  return (
    <section className="stack">
      <p>
        <Link href="/catalog">← {L('الكتالوج', 'Catalog')}</Link>
      </p>
      <PageHeader title={name} subtitle={`${item.sku}${item.brand ? ` · ${item.brand.name}` : ''}${item.model ? ` · ${item.model.name}` : ''}`} />
      <div className="layout-split">
        <div>
          <Card>
            <div className="thumb" style={{ aspectRatio: '4 / 3', background: '#eef2f7', borderRadius: 8, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
              {item.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.images[0].url} alt={item.images[0].altText ?? name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <span className="muted">{L('بلا صورة', 'No image')}</span>
              )}
            </div>
          </Card>
          {(localized(locale, item.descriptionAr, item.descriptionEn)) && (
            <Card title={L('الوصف', 'Description')}>
              <p>{localized(locale, item.descriptionAr, item.descriptionEn)}</p>
            </Card>
          )}
          {item.attributes.length > 0 && (
            <Card title={L('المواصفات', 'Specifications')}>
              <div className="table-wrap">
                <table>
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
            </Card>
          )}
        </div>
        <aside>
          <Card>
            <div className="stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <StatusBadge status={item.availability} />
                {item.quality && <span className="badge">{localized(locale, item.quality.nameAr, item.quality.nameEn)}</span>}
              </div>
              {priced && price ? (
                <div>
                  <div className="kpi-label">{L('سعرك', 'Your price')}</div>
                  <div className="kpi">
                    <Money value={price.amount} locale={locale} />
                  </div>
                </div>
              ) : (
                <p className="muted">{priced ? L('لا يوجد سعر لمستواك لهذا الصنف.', 'No price for your level on this item.') : L('سجّل الدخول كعميل معتمد لعرض السعر.', 'Sign in as an approved customer to see the price.')}</p>
              )}
              {canOrder(user) && available && price ? (
                <AddToCart sku={item.sku} locale={locale} />
              ) : !user ? (
                <Link className="btn btn-primary" href={`/login?next=${encodeURIComponent(`/products/${item.sku}`)}`}>
                  {L('تسجيل الدخول', 'Sign in')}
                </Link>
              ) : (
                <p className="muted">{available ? L('غير متاح للطلب حاليًا.', 'Not orderable right now.') : L('غير متوفر حاليًا.', 'Currently unavailable.')}</p>
              )}
            </div>
          </Card>
          {user?.userType === 'CUSTOMER' && (
            <ProductCustomerActions
              sku={item.sku}
              locale={locale}
              recordView={user.status === 'ACTIVE'}
              initialFavorite={!!(await db.favorite.findUnique({ where: { customerId_skuId: { customerId: user.id, skuId: item.id } }, select: { skuId: true } }))}
            />
          )}
        </aside>
      </div>

      {qualityVariants.length > 1 && (
        <Card title={L('الجودات المتاحة لهذا الموديل', 'Qualities for this model')}>
          <div className="table-wrap">
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
        </Card>
      )}

      {related.length > 0 && (
        <Card title={L('منتجات ذات صلة', 'Related items')}>
          <ul>
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/products/${encodeURIComponent(r.sku)}`}>{localized(locale, r.nameAr, r.nameEn)}</Link> <span className="muted" dir="ltr">{r.sku}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

import Link from 'next/link';
import { currentLocale, localized } from '@/lib/i18n';
import { requireSignedIn } from '@/lib/page-guards';
import { canSeePrices, viewerOf } from '@/lib/session';
import { db } from '@/lib/db';
import { projectSkusForViewer } from '@/modules/catalog/public';
import { Alert, EmptyState, Money, PageHeader, StatusBadge } from '@/components/ui';
import { RemoveButton } from '@/components/customer/RemoveButton';

export const dynamic = 'force-dynamic';

export default async function FavoritesPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const user = await requireSignedIn('/account/favorites');
  const title = L('المفضلة', 'Favorites');

  if (user.userType !== 'CUSTOMER') {
    return (
      <section className="stack">
        <PageHeader title={title} />
        <Alert tone="error">{L('هذه الصفحة مخصصة لحسابات العملاء.', 'This page is for customer accounts only.')}</Alert>
      </section>
    );
  }

  const favs = await db.favorite.findMany({ where: { customerId: user.id }, select: { sku: { select: { sku: true } } }, orderBy: { createdAt: 'desc' } });
  // Same projection the API uses: the price appears only for entitled viewers.
  const items = await projectSkusForViewer(
    favs.map((f) => f.sku.sku),
    viewerOf(user),
  );
  const priced = canSeePrices(user);

  return (
    <section className="stack">
      <PageHeader title={title} subtitle={priced ? undefined : L('سجّل كعميل معتمد لعرض الأسعار.', 'Approved customers see prices here.')} />
      {items.length === 0 ? (
        <EmptyState>{L('لم تُضف أي صنف إلى المفضلة بعد.', 'You have not saved any items yet.')}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{L('الصنف', 'Item')}</th>
                <th scope="col">{L('رمز SKU', 'SKU')}</th>
                <th scope="col">{L('التوفر', 'Availability')}</th>
                {priced && <th scope="col">{L('سعرك', 'Your price')}</th>}
                <th scope="col">
                  <span className="muted">{L('إجراءات', 'Actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const price = (it as { price?: { amount: string } }).price;
                return (
                  <tr key={it.sku}>
                    <td>
                      <Link href={`/products/${encodeURIComponent(it.sku)}`}>{localized(locale, it.nameAr, it.nameEn)}</Link>
                    </td>
                    <td dir="ltr">{it.sku}</td>
                    <td>
                      <StatusBadge status={it.availability} />
                    </td>
                    {priced && (
                      <td>
                        {price ? <Money value={price.amount} locale={locale} /> : <span className="muted">{L('لا يوجد سعر لمستواك', 'No price for your level')}</span>}
                      </td>
                    )}
                    <td>
                      <RemoveButton
                        endpoint={`/api/v1/me/favorites?sku=${encodeURIComponent(it.sku)}`}
                        label={L('إزالة', 'Remove')}
                        busyLabel="…"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

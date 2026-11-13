import Link from 'next/link';
import { currentLocale, localized } from '@/lib/i18n';
import { requireSignedIn } from '@/lib/page-guards';
import { db } from '@/lib/db';
import { Alert, EmptyState, PageHeader } from '@/components/ui';
import { fmtDate } from '@/components/customer/shared';

export const dynamic = 'force-dynamic';

/** Recently viewed items. Names and SKUs only: no prices on this page. */
export default async function RecentPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const user = await requireSignedIn('/account/recent');
  const title = L('تمت مشاهدتها مؤخرًا', 'Recently viewed');

  if (user.userType !== 'CUSTOMER') {
    return (
      <section className="stack">
        <PageHeader title={title} />
        <Alert tone="error">{L('هذه الصفحة مخصصة لحسابات العملاء.', 'This page is for customer accounts only.')}</Alert>
      </section>
    );
  }

  const rows = await db.recentView.findMany({
    where: { customerId: user.id },
    orderBy: { viewedAt: 'desc' },
    take: 20,
    include: { sku: { select: { sku: true, nameEn: true, nameAr: true, published: true, active: true } } },
  });
  const visible = rows.filter((r) => r.sku.published && r.sku.active);

  return (
    <section className="stack">
      <PageHeader title={title} />
      {visible.length === 0 ? (
        <EmptyState>{L('لا توجد مشاهدات حديثة.', 'Nothing viewed recently.')}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{L('الصنف', 'Item')}</th>
                <th scope="col">{L('رمز SKU', 'SKU')}</th>
                <th scope="col">{L('آخر مشاهدة', 'Last viewed')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.sku.sku}>
                  <td>
                    <Link href={`/products/${encodeURIComponent(r.sku.sku)}`}>{localized(locale, r.sku.nameAr, r.sku.nameEn)}</Link>
                  </td>
                  <td dir="ltr">{r.sku.sku}</td>
                  <td>{fmtDate(r.viewedAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

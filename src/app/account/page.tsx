import Link from 'next/link';
import { currentLocale, localized } from '@/lib/i18n';
import { requireSignedIn } from '@/lib/page-guards';
import { canSeePrices } from '@/lib/session';
import { db } from '@/lib/db';
import { listCustomerOrders } from '@/modules/commerce/orders';
import { PageHeader, StatusBadge } from '@/components/ui';
import { AccountShell } from '@/components/customer/AccountShell';

export const dynamic = 'force-dynamic';

/**
 * Account overview (CU-10). Tiles link only to existing pages and show counts taken from the database.
 * Nothing is invented: a count is shown only when it is a real query result.
 */
export default async function AccountPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const user = await requireSignedIn('/account');
  const isCustomer = user.userType === 'CUSTOMER';

  const [orders, addressCount, favoriteCount] = isCustomer
    ? await Promise.all([
        listCustomerOrders(user.id, { page: 1, pageSize: 1 }),
        db.address.count({ where: { customerId: user.id, deletedAt: null } }),
        db.favorite.count({ where: { customerId: user.id } }),
      ])
    : [null, 0, 0];

  const tiles: Array<{ href: string; ar: string; en: string; count?: number; show: boolean }> = [
    { href: '/orders', ar: 'طلباتي', en: 'My orders', count: orders?.total, show: isCustomer },
    { href: '/account/addresses', ar: 'عناويني', en: 'Addresses', count: addressCount, show: isCustomer },
    { href: '/account/favorites', ar: 'المفضلة', en: 'Favorites', count: favoriteCount, show: isCustomer },
    { href: '/account/profile', ar: 'الملف الشخصي', en: 'Profile', show: isCustomer },
    { href: '/account/recent', ar: 'تمت مشاهدتها مؤخرًا', en: 'Recently viewed', show: isCustomer },
    { href: '/account/notifications', ar: 'الإشعارات', en: 'Notifications', show: true },
  ];

  return (
    <AccountShell locale={locale} current="home" isCustomer={isCustomer}>
      <PageHeader title={L('حسابي', 'My account')} subtitle={user.displayName} />
      <section className="card" aria-labelledby="account-summary-h">
        <h2 id="account-summary-h" className="sr-only">
          {L('بيانات الحساب', 'Account details')}
        </h2>
        <dl className="kv" style={{ margin: 0 }}>
          <dt>{L('الاسم', 'Name')}</dt>
          <dd>{user.displayName}</dd>
          <dt>{L('الهاتف', 'Phone')}</dt>
          <dd dir="ltr" style={{ textAlign: 'start' }}>
            {user.phone}
          </dd>
          <dt>{L('الحالة', 'Status')}</dt>
          <dd>
            <StatusBadge status={user.status} />
          </dd>
          {canSeePrices(user) && (
            <>
              <dt>{L('مستوى السعر', 'Price level')}</dt>
              <dd>{user.priceLevelCode}</dd>
            </>
          )}
        </dl>
      </section>
      <nav aria-label={L('روابط الحساب', 'Account links')} className="card-grid">
        {tiles
          .filter((t) => t.show)
          .map((t) => (
            <Link key={t.href} className="card account-tile" href={t.href} style={{ marginBlockEnd: 0 }}>
              <strong>{L(t.ar, t.en)}</strong>
              {t.count !== undefined && (
                <span className="muted">
                  {L('العدد', 'Count')}: {t.count}
                </span>
              )}
            </Link>
          ))}
      </nav>
    </AccountShell>
  );
}

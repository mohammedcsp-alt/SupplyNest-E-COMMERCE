import Link from 'next/link';
import { currentLocale, localized } from '@/lib/i18n';
import { requireSignedIn } from '@/lib/page-guards';
import { canSeePrices } from '@/lib/session';
import { Card, PageHeader, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const user = await requireSignedIn('/account');
  const isCustomer = user.userType === 'CUSTOMER';

  const links: Array<{ href: string; ar: string; en: string; show: boolean }> = [
    { href: '/account/profile', ar: 'الملف الشخصي', en: 'Profile', show: isCustomer },
    { href: '/account/addresses', ar: 'عناويني', en: 'Addresses', show: isCustomer },
    { href: '/account/favorites', ar: 'المفضلة', en: 'Favorites', show: isCustomer },
    { href: '/account/recent', ar: 'تمت مشاهدتها مؤخرًا', en: 'Recently viewed', show: isCustomer },
    { href: '/orders', ar: 'طلباتي', en: 'My orders', show: isCustomer },
    { href: '/account/notifications', ar: 'الإشعارات', en: 'Notifications', show: true },
  ];

  return (
    <section className="stack">
      <PageHeader title={L('حسابي', 'My account')} subtitle={user.displayName} />
      <Card>
        <dl className="stack" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '8px 16px' }}>
          <dt className="muted">{L('الاسم', 'Name')}</dt>
          <dd style={{ margin: 0 }}>{user.displayName}</dd>
          <dt className="muted">{L('الهاتف', 'Phone')}</dt>
          <dd style={{ margin: 0 }} dir="ltr">
            {user.phone}
          </dd>
          <dt className="muted">{L('الحالة', 'Status')}</dt>
          <dd style={{ margin: 0 }}>
            <StatusBadge status={user.status} />
          </dd>
          {canSeePrices(user) && (
            <>
              <dt className="muted">{L('مستوى السعر', 'Price level')}</dt>
              <dd style={{ margin: 0 }}>{user.priceLevelCode}</dd>
            </>
          )}
        </dl>
      </Card>
      <nav aria-label={L('روابط الحساب', 'Account links')} className="card-grid">
        {links
          .filter((l) => l.show)
          .map((l) => (
            <Link key={l.href} className="card" href={l.href} style={{ marginBlockEnd: 0 }}>
              <strong>{L(l.ar, l.en)}</strong>
            </Link>
          ))}
      </nav>
    </section>
  );
}

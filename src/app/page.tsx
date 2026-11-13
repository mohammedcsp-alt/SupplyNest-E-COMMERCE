import Link from 'next/link';
import { currentLocale, messagesFor, localized } from '@/lib/i18n';
import { getCurrentUser, canSeePrices } from '@/lib/session';

export default async function HomePage() {
  const locale = await currentLocale();
  const t = messagesFor(locale);
  const user = await getCurrentUser();
  const priced = canSeePrices(user);
  return (
    <section className="stack">
      <div className="card">
        <h1>{t.home.title}</h1>
        <p className="muted">{t.home.intro}</p>
        <div className="row">
          <Link className="btn btn-primary" href="/catalog">
            {localized(locale, 'تصفح الكتالوج', 'Browse catalog')}
          </Link>
          <Link className="btn" href="/search">
            {localized(locale, 'بحث عن قطعة أو SKU', 'Search by name or SKU')}
          </Link>
          {!user && (
            <Link className="btn" href="/register">
              {localized(locale, 'طلب تسجيل كعميل', 'Apply for a customer account')}
            </Link>
          )}
        </div>
      </div>
      {!priced && user?.status === 'APPROVAL_PENDING' && (
        <div className="alert alert-warn">
          {localized(
            locale,
            'حسابك بانتظار موافقة الإدارة. لا تظهر الأسعار ولا يمكن إرسال الطلبات حتى التفعيل.',
            'Your account is awaiting administrator approval. Prices and ordering are unavailable until activation.',
          )}
        </div>
      )}
    </section>
  );
}

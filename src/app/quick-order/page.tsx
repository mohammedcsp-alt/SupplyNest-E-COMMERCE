import Link from 'next/link';
import { currentLocale, localized } from '@/lib/i18n';
import { requireSignedIn } from '@/lib/page-guards';
import { PageHeader } from '@/components/ui';
import { orderingGate } from '@/components/customer/gate';
import { QuickOrder } from '@/components/customer/QuickOrder';

export const dynamic = 'force-dynamic';

/** Quick order (CU-03): SKU and quantity rows, reviewed before anything is added to the cart. */
export default async function QuickOrderPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const user = await requireSignedIn('/quick-order');
  const title = L('طلب سريع', 'Quick order');
  const gate = orderingGate(user, locale);
  if (gate) {
    return (
      <section className="stack" style={{ marginBlockStart: 0 }}>
        <PageHeader title={title} />
        {gate}
      </section>
    );
  }

  return (
    <section className="stack" style={{ marginBlockStart: 0 }}>
      <nav className="crumbs" aria-label={L('مسار التصفح', 'Breadcrumb')}>
        <Link href="/">{L('الرئيسية', 'Home')}</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{title}</span>
      </nav>
      <PageHeader
        title={title}
        subtitle={L('أدخل رمز SKU والكمية لكل صنف، ثم راجع المعاينة قبل الإضافة إلى السلة.', 'Enter the SKU and quantity for each item, then review the preview before adding to your cart.')}
      />
      <QuickOrder locale={locale} />
    </section>
  );
}

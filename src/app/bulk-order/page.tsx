import { currentLocale, localized } from '@/lib/i18n';
import { requireSignedIn } from '@/lib/page-guards';
import { PageHeader } from '@/components/ui';
import { orderingGate } from '@/components/customer/gate';
import { BulkOrder } from '@/components/customer/BulkOrder';

export const dynamic = 'force-dynamic';

export default async function BulkOrderPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const user = await requireSignedIn('/bulk-order');
  const title = L('الطلب بالجملة', 'Bulk order');
  const gate = orderingGate(user, locale);
  if (gate) {
    return (
      <section className="stack">
        <PageHeader title={title} />
        {gate}
      </section>
    );
  }

  return (
    <section className="stack">
      <PageHeader title={title} subtitle={L('أضف عدة أصناف إلى السلة دفعة واحدة بعد مراجعتها.', 'Add many items to your cart at once after reviewing them.')} />
      <BulkOrder locale={locale} />
    </section>
  );
}

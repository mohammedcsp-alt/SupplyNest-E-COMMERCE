import Link from 'next/link';
import { currentLocale, localized } from '@/lib/i18n';
import { requireSignedIn } from '@/lib/page-guards';
import { db } from '@/lib/db';
import { getCart } from '@/modules/commerce/cart';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { ApiForm } from '@/components/forms';
import { orderingGate } from '@/components/customer/gate';
import { CheckoutFlow, type CheckoutAddress } from '@/components/customer/CheckoutFlow';
import { addressFormFields } from '@/components/customer/address-fields';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const user = await requireSignedIn('/checkout');
  const title = L('إتمام الطلب', 'Checkout');
  const gate = orderingGate(user, locale);
  if (gate) {
    return (
      <section className="stack">
        <PageHeader title={title} />
        {gate}
      </section>
    );
  }

  const [cart, addressRows, governorates, areas] = await Promise.all([
    getCart(user.id, user.priceLevelId ?? '', user.priceLevelCode ?? ''),
    db.address.findMany({
      where: { customerId: user.id, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: { governorate: true, area: true },
    }),
    db.governorate.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }] }),
    db.deliveryArea.findMany({ where: { active: true, governorate: { active: true } }, include: { governorate: true }, orderBy: { nameEn: 'asc' } }),
  ]);

  if (cart.items.length === 0) {
    return (
      <section className="stack">
        <PageHeader title={title} />
        <Card>
          <EmptyState>{L('سلتك فارغة، لا يوجد ما يُطلب.', 'Your cart is empty, so there is nothing to order.')}</EmptyState>
          <div className="row">
            <Link className="btn btn-primary" href="/catalog">
              {L('تصفح الكتالوج', 'Browse the catalog')}
            </Link>
          </div>
        </Card>
      </section>
    );
  }

  const addresses: CheckoutAddress[] = addressRows.map((a) => ({
    id: a.id,
    label: a.label,
    governorateAr: a.governorate.nameAr,
    governorateEn: a.governorate.nameEn,
    areaAr: a.area?.nameAr ?? null,
    areaEn: a.area?.nameEn ?? null,
    details: a.details,
    recipientName: a.recipientName,
    recipientPhone: a.recipientPhone,
    isDefault: a.isDefault,
  }));

  const addressForm = (
    <details open={addresses.length === 0} style={{ marginBlockStart: 12 }}>
      <summary style={{ cursor: 'pointer' }}>{L('إضافة عنوان جديد', 'Add a new address')}</summary>
      <div style={{ marginBlockStart: 12 }}>
        <ApiForm
          endpoint="/api/v1/me/addresses"
          submitLabel={L('حفظ العنوان', 'Save address')}
          busyLabel={L('جاري الحفظ…', 'Saving…')}
          successMessage={L('تم حفظ العنوان.', 'Address saved.')}
          fields={addressFormFields(locale, governorates, areas)}
        />
      </div>
    </details>
  );

  return (
    <section className="stack">
      <PageHeader title={title} subtitle={L(`${cart.count} صنف في السلة`, `${cart.count} item(s) in your cart`)} />
      <CheckoutFlow locale={locale} addresses={addresses}>
        {addressForm}
      </CheckoutFlow>
    </section>
  );
}

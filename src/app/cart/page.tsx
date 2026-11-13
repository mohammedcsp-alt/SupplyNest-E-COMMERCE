import Link from 'next/link';
import { currentLocale, localized } from '@/lib/i18n';
import { requireSignedIn } from '@/lib/page-guards';
import { getCart } from '@/modules/commerce/cart';
import { Card, EmptyState, Money, PageHeader, StatusBadge } from '@/components/ui';
import { orderingGate } from '@/components/customer/gate';
import { CartLineEditor } from '@/components/customer/CartLineEditor';

export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const locale = await currentLocale();
  const L = (ar: string, en: string) => localized(locale, ar, en);
  const user = await requireSignedIn('/cart');
  const title = L('سلة المشتريات', 'Cart');
  const gate = orderingGate(user, locale);
  if (gate) {
    return (
      <section className="stack">
        <PageHeader title={title} />
        {gate}
      </section>
    );
  }

  const cart = await getCart(user.id, user.priceLevelId ?? '', user.priceLevelCode ?? '');
  const pricedLines = cart.items.filter((i) => i.lineTotal !== null);
  const total = pricedLines.reduce((sum, i) => sum + BigInt(i.lineTotal ?? '0'), BigInt(0));
  const notOrderable = cart.items.filter((i) => !i.orderable).length;

  return (
    <section className="stack">
      <PageHeader title={title} subtitle={L('أسعارك حسب مستوى حسابك. الضريبة غير مضافة.', 'Prices follow your account price level. No tax is added.')} />

      {cart.items.length === 0 ? (
        <Card>
          <EmptyState>{L('سلتك فارغة.', 'Your cart is empty.')}</EmptyState>
          <div className="row">
            <Link className="btn btn-primary" href="/catalog">
              {L('تصفح الكتالوج', 'Browse the catalog')}
            </Link>
            <Link className="btn" href="/bulk-order">
              {L('إضافة بالجملة (SKU)', 'Bulk add by SKU')}
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{L('الصنف', 'Item')}</th>
                  <th scope="col">{L('رمز SKU', 'SKU')}</th>
                  <th scope="col">{L('سعر الوحدة', 'Unit price')}</th>
                  <th scope="col">{L('الكمية', 'Quantity')}</th>
                  <th scope="col">{L('الإجمالي', 'Line total')}</th>
                  <th scope="col">{L('التوفر', 'Availability')}</th>
                </tr>
              </thead>
              <tbody>
                {cart.items.map((i) => (
                  <tr key={i.sku}>
                    <td>
                      <Link href={`/products/${encodeURIComponent(i.sku)}`}>{localized(locale, i.nameAr, i.nameEn)}</Link>
                    </td>
                    <td dir="ltr">{i.sku}</td>
                    <td>
                      <Money value={i.unitPrice} locale={locale} />
                    </td>
                    <td>
                      <CartLineEditor sku={i.sku} qty={i.qty} locale={locale} />
                    </td>
                    <td>
                      <Money value={i.lineTotal} locale={locale} />
                    </td>
                    <td>
                      <StatusBadge status={i.orderable ? 'AVAILABLE' : 'UNAVAILABLE'} />
                      {!i.orderable && <div className="muted">{L('الكمية تتجاوز المتوفر أو الصنف غير متاح', 'Quantity exceeds stock or item unavailable')}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Card>
            <div className="page-head" style={{ marginBlockEnd: 0 }}>
              <div>
                <div className="kpi-label">{L('الإجمالي (قبل رسوم التوصيل)', 'Subtotal (before delivery fee)')}</div>
                <div className="kpi">
                  <Money value={total.toString()} locale={locale} />
                </div>
              </div>
              <Link className="btn btn-primary" href="/checkout">
                {L('المتابعة إلى الدفع', 'Continue to checkout')}
              </Link>
            </div>
            {notOrderable > 0 && (
              <p className="field-error" role="status">
                {L(`${notOrderable} صنف لا يمكن طلبه حاليًا. أزله أو عدّل كميته قبل الدفع.`, `${notOrderable} item(s) cannot be ordered right now. Remove them or change the quantity before checkout.`)}
              </p>
            )}
          </Card>
        </>
      )}
    </section>
  );
}

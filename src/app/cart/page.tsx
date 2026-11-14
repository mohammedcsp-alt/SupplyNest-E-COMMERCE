import Link from 'next/link';
import { currentLocale, localized } from '@/lib/i18n';
import { requireSignedIn } from '@/lib/page-guards';
import { getCart } from '@/modules/commerce/cart';
import { db } from '@/lib/db';
import { EmptyState, Money, PageHeader, StatusBadge } from '@/components/ui';
import { orderingGate } from '@/components/customer/gate';
import { CartLineEditor } from '@/components/customer/CartLineEditor';

export const dynamic = 'force-dynamic';

/** Cart: line cards with thumbnail, quantity controls and a sticky order summary. Business rules are unchanged (getCart, orderable flags). */
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
  const units = cart.items.reduce((n, i) => n + i.qty, 0);

  // First image per SKU for the thumbnails (public media route; only published SKUs have images served).
  const imageRows = cart.items.length
    ? await db.sku.findMany({ where: { sku: { in: cart.items.map((i) => i.sku) } }, select: { sku: true, images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { id: true, altText: true } } } })
    : [];
  const imageBySku = new Map(imageRows.map((r) => [r.sku, r.images[0] ?? null]));

  return (
    <section className="stack" style={{ marginBlockStart: 0 }}>
      <nav className="crumbs" aria-label={L('مسار التصفح', 'Breadcrumb')}>
        <Link href="/">{L('الرئيسية', 'Home')}</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{title}</span>
      </nav>
      <PageHeader
        title={`${title}${cart.items.length ? ` (${cart.items.length})` : ''}`}
        subtitle={L('أسعارك حسب مستوى حسابك. الضريبة غير مضافة.', 'Prices follow your account price level. No tax is added.')}
      />

      {cart.items.length === 0 ? (
        <div className="empty-state">
          <strong>{L('سلتك فارغة.', 'Your cart is empty.')}</strong>
          <div className="row" style={{ justifyContent: 'center', marginBlockStart: 10 }}>
            <Link className="btn btn-primary" href="/catalog">
              {L('تصفح الكتالوج', 'Browse the catalogue')}
            </Link>
            <Link className="btn" href="/bulk-order">
              {L('إضافة بالجملة (SKU)', 'Bulk add by SKU')}
            </Link>
          </div>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-lines" role="list" aria-label={L('أصناف السلة', 'Cart items')}>
            {cart.items.map((i) => {
              const name = localized(locale, i.nameAr, i.nameEn);
              const img = imageBySku.get(i.sku);
              return (
                <article key={i.sku} className="cart-line" role="listitem">
                  <div className="cart-thumb">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/v1/media/${img.id}`} alt={img.altText ?? name} loading="lazy" />
                    ) : (
                      <span className="muted" style={{ fontSize: '0.75rem' }}>{L('بلا صورة', 'No image')}</span>
                    )}
                  </div>
                  <div className="cart-info">
                    <Link href={`/products/${encodeURIComponent(i.sku)}`} className="cart-name">
                      {name}
                    </Link>
                    <div className="sku-line" dir="ltr">
                      {i.sku}
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <StatusBadge status={i.orderable ? 'AVAILABLE' : 'UNAVAILABLE'} />
                      {!i.orderable && <span className="field-error" style={{ fontSize: '0.82rem' }}>{L('الكمية تتجاوز المتوفر أو الصنف غير متاح', 'Quantity exceeds stock or item unavailable')}</span>}
                    </div>
                  </div>
                  <div className="cart-qty">
                    <span className="kpi-label">{L('الكمية', 'Quantity')}</span>
                    <CartLineEditor sku={i.sku} qty={i.qty} locale={locale} />
                  </div>
                  <div className="cart-price">
                    <span className="kpi-label">{L('سعر الوحدة', 'Unit price')}</span>
                    <Money value={i.unitPrice} locale={locale} />
                  </div>
                  <div className="cart-total">
                    <span className="kpi-label">{L('الإجمالي', 'Line total')}</span>
                    <strong>
                      <Money value={i.lineTotal} locale={locale} />
                    </strong>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="cart-summary" aria-labelledby="cart-summary-h">
            <h2 id="cart-summary-h" style={{ fontSize: '1.05rem' }}>
              {L('ملخص الطلب', 'Order summary')}
            </h2>
            <dl className="kv" style={{ margin: 0 }}>
              <dt>{L('عدد الأصناف', 'Lines')}</dt>
              <dd>{cart.items.length}</dd>
              <dt>{L('عدد الوحدات', 'Units')}</dt>
              <dd>{units}</dd>
            </dl>
            <div>
              <div className="kpi-label">{L('الإجمالي قبل رسوم التوصيل', 'Subtotal before delivery fee')}</div>
              <div className="kpi">
                <Money value={total.toString()} locale={locale} />
              </div>
            </div>
            {notOrderable > 0 && (
              <p className="alert alert-warn" role="status" style={{ margin: 0 }}>
                {L(`${notOrderable} صنف لا يمكن طلبه حاليًا. أزله أو عدّل كميته قبل الدفع.`, `${notOrderable} item(s) cannot be ordered right now. Remove them or change the quantity before checkout.`)}
              </p>
            )}
            <Link className={`btn btn-primary btn-block${notOrderable > 0 ? ' disabled' : ''}`} href="/checkout" aria-disabled={notOrderable > 0 ? 'true' : undefined}>
              {L('المتابعة إلى الدفع', 'Continue to checkout')}
            </Link>
            <Link className="btn btn-block" href="/bulk-order">
              {L('إضافة المزيد بالجملة', 'Add more in bulk')}
            </Link>
          </aside>
        </div>
      )}
    </section>
  );
}

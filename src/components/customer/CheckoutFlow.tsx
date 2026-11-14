'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { api, newIdempotencyKey } from '@/lib/client-api';
import { fmtIqd, pick, WARNING_TEXT, type Loc } from './shared';

export type CheckoutAddress = {
  id: string;
  label: string | null;
  governorateAr: string;
  governorateEn: string;
  areaAr: string | null;
  areaEn: string | null;
  details: string;
  recipientName: string;
  recipientPhone: string;
  isDefault: boolean;
};

type QuoteLine = { skuId: string; sku: string; nameAr: string; nameEn: string; qty: number; unitPrice: string | null; lineTotal: string | null };
type QuoteWarning = { code: string; sku: string; message: string };
type Quote = {
  quoteHash: string;
  lines: QuoteLine[];
  warnings: QuoteWarning[];
  blocking: boolean;
  shippingFee: string | null;
  subtotal: string | null;
  total: string | null;
};

/**
 * Checkout steps 1-3. Step 1 picks a saved address; step 2 shows the server quote for it (prices, delivery fee,
 * warnings); step 3 needs an explicit price-consent tick before POST /api/v1/orders with a fresh Idempotency-Key.
 * The server re-verifies the quote hash, so a stale review cannot place an order.
 * Layout: step cards on the start side, a sticky order summary (totals from the same quote) on the end side.
 */
export function CheckoutFlow({ locale, addresses, children }: { locale: Loc; addresses: CheckoutAddress[]; children?: ReactNode }) {
  const ar = locale === 'ar';
  const L = (a: string, e: string) => (ar ? a : e);
  const [selectedId, setSelectedId] = useState<string>(() => (addresses.find((a) => a.isDefault) ?? addresses[0])?.id ?? '');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestSeq = useRef(0);

  async function loadQuote(addressId: string) {
    const seq = ++requestSeq.current;
    setQuoteBusy(true);
    setQuoteErr(null);
    setQuote(null);
    setConsent(false);
    const res = await api<Quote>('/api/v1/checkout/quote', { method: 'POST', body: { addressId } });
    if (seq !== requestSeq.current) return;
    setQuoteBusy(false);
    if (!res.ok) {
      setQuoteErr(
        res.code === 'SHIPPING_RULE_MISSING'
          ? L('لا يمكن توصيل الطلب إلى هذه المنطقة حاليًا. اختر عنوانًا آخر.', 'This area cannot be delivered yet. Choose another address.')
          : res.message,
      );
      return;
    }
    setQuote(res.data);
  }

  useEffect(() => {
    if (selectedId) void loadQuote(selectedId);
    // loadQuote is recreated each render but only depends on the selected address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function placeOrder() {
    if (!quote || quote.blocking || !consent || submitting) return;
    setSubmitting(true);
    setSubmitErr(null);
    setNotice(null);
    const res = await api<{ id: string; orderNumber: string }>('/api/v1/orders', {
      method: 'POST',
      body: { addressId: selectedId, quoteHash: quote.quoteHash, note: note.trim() || null },
      idempotencyKey: newIdempotencyKey(),
    });
    if (res.ok) {
      window.location.assign(`/orders/${res.data.id}`);
      return;
    }
    setSubmitting(false);
    switch (res.code) {
      case 'PRICE_CHANGED':
        setNotice(L('تغيّرت الأسعار أو رسوم التوصيل. راجع العرض المحدّث وأكّد من جديد.', 'Prices or the delivery fee changed. Review the updated quote and confirm again.'));
        await loadQuote(selectedId);
        break;
      case 'STOCK_CHANGED':
        setNotice(L('تغيّر المخزون المتوفر. راجع الكميات وأكّد من جديد.', 'Stock availability changed. Review quantities and confirm again.'));
        await loadQuote(selectedId);
        break;
      case 'SHIPPING_RULE_MISSING':
        setSubmitErr(L('لا يمكن توصيل الطلب إلى هذه المنطقة حاليًا. اختر عنوانًا آخر.', 'This area cannot be delivered yet. Choose another address.'));
        break;
      default:
        setSubmitErr(res.message);
    }
  }

  const selected = addresses.find((a) => a.id === selectedId);
  const canSubmit = !!quote && !quote.blocking && consent && !submitting && !quoteBusy;

  return (
    <div className="checkout-layout">
      <div className="checkout-steps">
        <section className="card checkout-step" aria-labelledby="checkout-step1">
          <h2 id="checkout-step1" className="step-title">
            <span className="step-num" aria-hidden="true">1</span>
            {L('عنوان التوصيل', 'Delivery address')}
          </h2>
          {addresses.length === 0 ? (
            <p className="muted">{L('لا توجد عناوين محفوظة. أضف عنوانًا أدناه.', 'No saved addresses. Add one below.')}</p>
          ) : (
            <fieldset style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0 }}>
              <legend className="muted" style={{ marginBlockEnd: 8 }}>
                {L('اختر عنوانًا محفوظًا', 'Choose a saved address')}
              </legend>
              <div className="stack" style={{ gap: 8 }}>
                {addresses.map((a) => (
                  <label key={a.id} className={`card address-option${selectedId === a.id ? ' is-selected' : ''}`}>
                    <div className="address-option-head">
                      <input type="radio" name="address" value={a.id} checked={selectedId === a.id} onChange={() => setSelectedId(a.id)} />
                      <strong>{a.label || pick(locale, a.governorateAr, a.governorateEn)}</strong>
                      {a.isDefault && <span className="badge badge-info">{L('افتراضي', 'Default')}</span>}
                    </div>
                    <div className="muted" style={{ marginBlockStart: 4 }}>
                      {pick(locale, a.governorateAr, a.governorateEn)}
                      {(a.areaAr || a.areaEn) && ` — ${pick(locale, a.areaAr, a.areaEn)}`} · {a.details}
                    </div>
                    <div className="muted" dir="ltr" style={{ textAlign: 'start' }}>
                      {a.recipientName} · {a.recipientPhone}
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {children}
          <p style={{ marginBlockStart: 12, marginBlockEnd: 0 }}>
            <Link href="/cart">{L('← تعديل السلة', '← Edit cart')}</Link>
          </p>
        </section>

        <section className="card checkout-step" aria-labelledby="checkout-step2" aria-live="polite">
          <h2 id="checkout-step2" className="step-title">
            <span className="step-num" aria-hidden="true">2</span>
            {L('مراجعة الأسعار والتوصيل', 'Review prices and delivery')}
          </h2>
          {!selected && <p className="muted">{L('اختر عنوانًا للمتابعة.', 'Choose an address to continue.')}</p>}
          {quoteBusy && <p className="muted">{L('جاري حساب العرض…', 'Calculating your quote…')}</p>}
          {quoteErr && (
            <p className="alert alert-error" role="alert">
              {quoteErr}
            </p>
          )}
          {quote && (
            <>
              {quote.warnings.length > 0 && (
                <div className={quote.blocking ? 'alert alert-error' : 'alert alert-warn'} role={quote.blocking ? 'alert' : 'status'}>
                  <strong>{quote.blocking ? L('لا يمكن إتمام الطلب بعد:', 'The order cannot be placed yet:') : L('تنبيهات:', 'Notices:')}</strong>
                  <ul style={{ margin: '6px 0 0', paddingInlineStart: 20 }}>
                    {quote.warnings.map((w, idx) => {
                      const t = WARNING_TEXT[w.code];
                      return (
                        <li key={`${w.code}-${w.sku}-${idx}`}>
                          <span dir="ltr">{w.sku}</span>: {t ? pick(locale, t[0], t[1]) : w.message}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{L('الصنف', 'Item')}</th>
                      <th scope="col">{L('رمز SKU', 'SKU')}</th>
                      <th scope="col">{L('الكمية', 'Qty')}</th>
                      <th scope="col">{L('سعر الوحدة', 'Unit price')}</th>
                      <th scope="col">{L('الإجمالي', 'Line total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.lines.map((l) => (
                      <tr key={l.skuId}>
                        <td>{pick(locale, l.nameAr, l.nameEn)}</td>
                        <td dir="ltr">{l.sku}</td>
                        <td>{l.qty}</td>
                        <td>{fmtIqd(l.unitPrice, locale)}</td>
                        <td>{fmtIqd(l.lineTotal, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="card checkout-step" aria-labelledby="checkout-step3">
          <h2 id="checkout-step3" className="step-title">
            <span className="step-num" aria-hidden="true">3</span>
            {L('التأكيد', 'Confirm')}
          </h2>
          {notice && (
            <p className="alert alert-warn" role="status">
              {notice}
            </p>
          )}
          {submitErr && (
            <p className="alert alert-error" role="alert">
              {submitErr}
            </p>
          )}
          <div className="field">
            <label className="row" style={{ fontWeight: 400, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={!quote || quote.blocking} />
              <span>{L('أوافق على هذه الأسعار ورسوم التوصيل.', 'I accept these prices and delivery fee.')}</span>
            </label>
          </div>
          <div className="field">
            <label htmlFor="checkout-note">{L('ملاحظة للطلب (اختياري)', 'Note for this order (optional)')}</label>
            <textarea id="checkout-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} rows={3} />
            <div className="field-help">{L('لا تُضاف الملاحظة إلى السعر. حتى 500 حرف.', 'The note does not change the price. Up to 500 characters.')}</div>
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={placeOrder} disabled={!canSubmit}>
            {submitting ? L('جاري إرسال الطلب…', 'Placing order…') : L('تأكيد الطلب', 'Place order')}
          </button>
          {!quote && !quoteBusy && selected && <p className="muted" style={{ marginBlockEnd: 0 }}>{L('راجع العرض أولًا.', 'Review the quote first.')}</p>}
        </section>
      </div>

      <aside className="cart-summary checkout-summary" aria-labelledby="checkout-summary-h">
        <h2 id="checkout-summary-h" style={{ fontSize: '1.05rem', margin: 0 }}>
          {L('ملخص الطلب', 'Order summary')}
        </h2>
        {!quote ? (
          <p className="muted" style={{ margin: 0 }}>
            {quoteBusy ? L('جاري حساب العرض…', 'Calculating your quote…') : L('يظهر الإجمالي بعد اختيار العنوان.', 'The total appears after you choose an address.')}
          </p>
        ) : (
          <>
            <dl className="kv" style={{ margin: 0 }}>
              <dt>{L('المجموع الفرعي', 'Subtotal')}</dt>
              <dd>{fmtIqd(quote.subtotal, locale)}</dd>
              <dt>{L('رسوم التوصيل', 'Delivery fee')}</dt>
              <dd>{fmtIqd(quote.shippingFee, locale)}</dd>
            </dl>
            <div>
              <div className="kpi-label">{L('الإجمالي (الدفع عند الاستلام)', 'Total (cash on delivery)')}</div>
              <div className="kpi">{fmtIqd(quote.total, locale)}</div>
            </div>
            <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
              {L('مرجع العرض:', 'Quote reference:')} <code dir="ltr" style={{ wordBreak: 'break-all' }}>{quote.quoteHash.slice(0, 16)}…</code>
            </p>
          </>
        )}
        {quote?.blocking && (
          <p className="alert alert-error" role="alert" style={{ margin: 0 }}>
            {L('لا يمكن إتمام الطلب قبل حل التنبيهات.', 'Resolve the notices before placing the order.')}
          </p>
        )}
        <Link className="btn btn-block" href="/cart">
          {L('تعديل السلة', 'Edit cart')}
        </Link>
      </aside>
    </div>
  );
}

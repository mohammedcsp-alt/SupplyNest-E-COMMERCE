'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client-api';
import { fmtIqd, MAX_QTY_PER_SKU, type Loc } from './shared';

export type EditableItem = { sku: string; title: string; qty: number; unitPrice: string | null; lineTotal: string | null };
type PriceChange = { sku: string; from: string; to: string };

/**
 * ORD-02 / CUS-12: edit quantities of a SUBMITTED order before preparation starts.
 * Sends the full desired line set with expectedVersion. A PRICE_CHANGED reply shows the new prices; the order is only
 * re-submitted with acceptPriceChanges=true after the customer presses the confirm button.
 */
export function EditLines({ orderId, version, items, locale }: { orderId: string; version: number; items: EditableItem[]; locale: Loc }) {
  const ar = locale === 'ar';
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(items.map((i) => [i.sku, i.qty])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [changes, setChanges] = useState<PriceChange[] | null>(null);

  async function submit(acceptPriceChanges: boolean) {
    setBusy(true);
    setMsg(null);
    const res = await api<unknown>(`/api/v1/orders/${orderId}`, {
      method: 'PATCH',
      body: {
        expectedVersion: version,
        lines: items.map((i) => ({ sku: i.sku, qty: qty[i.sku] ?? 0 })),
        acceptPriceChanges,
      },
    });
    setBusy(false);
    if (res.ok) {
      setChanges(null);
      setMsg({ tone: 'ok', text: ar ? 'تم حفظ التعديلات.' : 'Changes saved.' });
      router.refresh();
      return;
    }
    if (res.code === 'PRICE_CHANGED') {
      const pc = (res.details as { priceChanges?: PriceChange[] } | undefined)?.priceChanges ?? [];
      setChanges(pc);
      setMsg({
        tone: 'warn',
        text: ar ? 'تغيّر سعر بعض الأصناف التي عدّلتها. راجع الأسعار الجديدة ثم أكّد.' : 'Some edited items now have a different price. Review the new prices and confirm.',
      });
      return;
    }
    setChanges(null);
    setMsg({ tone: 'error', text: res.message });
    if (res.code === 'CONFLICT') router.refresh();
  }

  const invalid = items.some((i) => {
    const q = qty[i.sku];
    return !Number.isInteger(q) || q < 0 || q > MAX_QTY_PER_SKU;
  });

  return (
    <div className="stack">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">{ar ? 'الصنف' : 'Item'}</th>
              <th scope="col">{ar ? 'رمز SKU' : 'SKU'}</th>
              <th scope="col">{ar ? 'سعر الوحدة' : 'Unit price'}</th>
              <th scope="col">{ar ? 'الكمية' : 'Qty'}</th>
              <th scope="col">{ar ? 'الإجمالي' : 'Line total'}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.sku}>
                <td>{i.title}</td>
                <td dir="ltr">{i.sku}</td>
                <td>{fmtIqd(i.unitPrice, locale)}</td>
                <td>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_QTY_PER_SKU}
                    value={qty[i.sku] ?? 0}
                    aria-label={ar ? `الكمية للصنف ${i.sku}` : `Quantity for ${i.sku}`}
                    onChange={(e) => setQty((prev) => ({ ...prev, [i.sku]: e.target.value === '' ? NaN : Number(e.target.value) }))}
                    style={{ width: 84, maxWidth: '100%' }}
                  />
                </td>
                <td>{fmtIqd(i.lineTotal, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: '0.9rem' }}>
        {ar ? 'ضع الكمية 0 لإزالة الصنف. لا يمكن أن يبقى الطلب فارغًا.' : 'Set quantity to 0 to remove an item. An order must keep at least one item.'}
      </p>

      {changes && changes.length > 0 && (
        <div className="card" role="region" aria-label={ar ? 'تغييرات الأسعار' : 'Price changes'}>
          <h3 style={{ marginBlockStart: 0 }}>{ar ? 'الأسعار الجديدة' : 'New prices'}</h3>
          <ul style={{ paddingInlineStart: 20 }}>
            {changes.map((c) => (
              <li key={c.sku}>
                <span dir="ltr">{c.sku}</span>: {fmtIqd(c.from, locale)} → {fmtIqd(c.to, locale)}
              </li>
            ))}
          </ul>
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => submit(true)}>
              {ar ? 'أقبل الأسعار الجديدة وأحفظ' : 'Accept new prices and save'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setChanges(null)}>
              {ar ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={msg.tone === 'error' ? 'alert alert-error' : msg.tone === 'warn' ? 'alert alert-warn' : 'alert alert-ok'} role={msg.tone === 'error' ? 'alert' : 'status'}>
          {msg.text}
        </p>
      )}

      {!changes && (
        <div>
          <button type="button" className="btn btn-primary" disabled={busy || invalid} onClick={() => submit(false)}>
            {busy ? (ar ? 'جاري الحفظ…' : 'Saving…') : ar ? 'حفظ التعديلات' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  );
}

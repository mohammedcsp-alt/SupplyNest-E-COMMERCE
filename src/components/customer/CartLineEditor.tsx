'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client-api';
import { MAX_QTY_PER_SKU, type Loc } from './shared';

/** Quantity editor for one cart line. qty 0 removes the line (CUS-06). */
export function CartLineEditor({ sku, qty, locale }: { sku: string; qty: number; locale: Loc }) {
  const ar = locale === 'ar';
  const router = useRouter();
  const [value, setValue] = useState(String(qty));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1 && n <= MAX_QTY_PER_SKU;

  async function save(next: number) {
    setBusy(true);
    setErr(null);
    const res = await api('/api/v1/cart/items', { method: 'PUT', body: { sku, qty: next } });
    setBusy(false);
    if (!res.ok) {
      setErr(res.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 6 }}>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_QTY_PER_SKU}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={ar ? `الكمية للصنف ${sku}` : `Quantity for ${sku}`}
          aria-invalid={!valid}
          style={{ width: 84, maxWidth: '100%' }}
        />
        <button type="button" className="btn btn-small" disabled={busy || !valid || n === qty} onClick={() => save(n)}>
          {ar ? 'تحديث' : 'Update'}
        </button>
        <button type="button" className="btn btn-danger btn-small" disabled={busy} onClick={() => save(0)}>
          {ar ? 'إزالة' : 'Remove'}
        </button>
      </div>
      {!valid && (
        <span className="field-error">{ar ? `أدخل رقمًا من 1 إلى ${MAX_QTY_PER_SKU}` : `Enter a number from 1 to ${MAX_QTY_PER_SKU}`}</span>
      )}
      {err && (
        <span className="field-error" role="alert">
          {err}
        </span>
      )}
    </div>
  );
}

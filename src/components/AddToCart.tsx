'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client-api';
import type { Locale } from '@/lib/i18n';

/** Quick add with quantity (UX-006). The server re-validates price, stock and eligibility on every call. */
export function AddToCart({ sku, locale }: { sku: string; locale: Locale }) {
  const ar = locale === 'ar';
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function add() {
    setBusy(true);
    setMsg(null);
    const res = await api<{ sku: string; qty: number; availableNow: boolean }>('/api/v1/cart/items', { method: 'PUT', body: { sku, qty } });
    setBusy(false);
    if (!res.ok) {
      setMsg({ tone: 'error', text: res.message });
      return;
    }
    setMsg({
      tone: res.data.availableNow ? 'ok' : 'error',
      text: res.data.availableNow ? (ar ? 'أُضيف إلى السلة.' : 'Added to cart.') : ar ? 'أضيف، لكن الكمية تتجاوز المتوفر حاليًا.' : 'Added, but the quantity exceeds current stock.',
    });
  }

  return (
    <div className="stack">
      <div className="row">
        <label htmlFor={`qty-${sku}`} style={{ margin: 0 }}>
          {ar ? 'الكمية' : 'Quantity'}
        </label>
        <input id={`qty-${sku}`} type="number" min={1} max={100} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} style={{ width: 110 }} />
        <button type="button" className="btn btn-primary" onClick={add} disabled={busy}>
          {busy ? '…' : ar ? 'أضف إلى السلة' : 'Add to cart'}
        </button>
      </div>
      {msg && (
        <p role={msg.tone === 'error' ? 'alert' : 'status'} className={msg.tone === 'error' ? 'field-error' : 'alert alert-ok'}>
          {msg.text}{' '}
          {msg.tone === 'ok' && <Link href="/cart">{ar ? 'عرض السلة' : 'View cart'}</Link>}
        </p>
      )}
    </div>
  );
}

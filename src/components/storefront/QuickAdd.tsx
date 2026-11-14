'use client';

import { useState } from 'react';
import { api } from '@/lib/client-api';

export const MAX_QTY = 100; // mirrors order.maxQtyPerSku default; the server re-validates every call.

/** Quantity stepper: − / number / +. Clamped to 1..MAX_QTY; the server remains the authority. */
export function QtyStepper({ id, value, onChange, locale, disabled }: { id: string; value: number; onChange: (n: number) => void; locale: 'ar' | 'en'; disabled?: boolean }) {
  const ar = locale === 'ar';
  const clamp = (n: number) => Math.max(1, Math.min(MAX_QTY, Math.floor(Number.isFinite(n) ? n : 1)));
  return (
    <div className="qty" role="group" aria-label={ar ? 'الكمية' : 'Quantity'}>
      <button type="button" onClick={() => onChange(clamp(value - 1))} disabled={disabled || value <= 1} aria-label={ar ? 'إنقاص' : 'Decrease'}>
        −
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_QTY}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        aria-label={ar ? 'الكمية' : 'Quantity'}
      />
      <button type="button" onClick={() => onChange(clamp(value + 1))} disabled={disabled || value >= MAX_QTY} aria-label={ar ? 'زيادة' : 'Increase'}>
        +
      </button>
    </div>
  );
}

/**
 * Quantity + add-to-cart for one SKU. Only rendered for approved, active customers (the caller decides).
 * Shows the server's answer; never assumes success.
 */
export function QuickAdd({ sku, locale, compact = false }: { sku: string; locale: 'ar' | 'en'; compact?: boolean }) {
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
    setMsg(
      res.data.availableNow
        ? { tone: 'ok', text: ar ? 'أُضيف إلى السلة' : 'Added to cart' }
        : { tone: 'error', text: ar ? 'أُضيف، لكن الكمية تتجاوز المتوفر' : 'Added, but quantity exceeds availability' },
    );
  }

  return (
    <div className="stack" style={{ marginBlockStart: 0 }}>
      <div className="add-row">
        <QtyStepper id={`qty-${sku}`} value={qty} onChange={setQty} locale={locale} disabled={busy} />
        <button type="button" className="btn btn-primary btn-cart" onClick={add} disabled={busy} aria-label={`${ar ? 'أضف إلى السلة' : 'Add to cart'} ${sku}`}>
          {busy ? '…' : compact ? '+' : ar ? 'أضف إلى السلة' : 'Add to cart'}
        </button>
      </div>
      {msg && (
        <p role={msg.tone === 'error' ? 'alert' : 'status'} className={msg.tone === 'error' ? 'field-error' : 'muted'} style={{ fontSize: '0.8rem', margin: 0 }}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

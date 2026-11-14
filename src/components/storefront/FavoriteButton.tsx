'use client';

import { useState } from 'react';
import { api } from '@/lib/client-api';

/** Heart toggle for a SKU. Only rendered for active customers; the API enforces the same rule. */
export function FavoriteButton({ sku, locale, initial }: { sku: string; locale: 'ar' | 'en'; initial: boolean }) {
  const ar = locale === 'ar';
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const label = on ? (ar ? 'إزالة من المفضلة' : 'Remove from favourites') : ar ? 'إضافة إلى المفضلة' : 'Add to favourites';

  async function toggle() {
    setBusy(true);
    const res = on
      ? await api(`/api/v1/me/favorites?sku=${encodeURIComponent(sku)}`, { method: 'DELETE' })
      : await api('/api/v1/me/favorites', { method: 'POST', body: { sku } });
    setBusy(false);
    if (res.ok) setOn(!on);
  }

  return (
    <button type="button" className="fav-btn" onClick={toggle} disabled={busy} aria-pressed={on} aria-label={label} title={label} style={on ? { color: 'var(--accent-strong)' } : undefined}>
      {on ? '♥' : '♡'}
    </button>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client-api';
import type { Loc } from './shared';

/**
 * Customer-only helpers on a product page:
 * - records the view in recently viewed (active customers only; the API ignores others), and
 * - toggles the favorite flag.
 */
export function ProductCustomerActions({ sku, locale, recordView, initialFavorite }: { sku: string; locale: Loc; recordView: boolean; initialFavorite: boolean }) {
  const ar = locale === 'ar';
  const [favorite, setFavorite] = useState(initialFavorite);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!recordView) return;
    void api('/api/v1/me/recent', { method: 'POST', body: { sku } });
  }, [sku, recordView]);

  async function toggle() {
    setBusy(true);
    setErr(null);
    const res = favorite
      ? await api(`/api/v1/me/favorites?sku=${encodeURIComponent(sku)}`, { method: 'DELETE' })
      : await api('/api/v1/me/favorites', { method: 'POST', body: { sku } });
    setBusy(false);
    if (!res.ok) {
      setErr(res.message);
      return;
    }
    setFavorite(!favorite);
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <button type="button" className="btn btn-small" onClick={toggle} disabled={busy} aria-pressed={favorite}>
        {favorite ? (ar ? '★ في المفضلة (إزالة)' : '★ Saved (remove)') : ar ? '☆ إضافة إلى المفضلة' : '☆ Save to favorites'}
      </button>
      {err && (
        <span className="field-error" role="alert">
          {err}
        </span>
      )}
    </div>
  );
}

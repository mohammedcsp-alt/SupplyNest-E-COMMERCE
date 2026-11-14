'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client-api';

/** One SKU row: featured toggle and display order. Only merchandising fields are sent; price and stock are untouched. */
export function FeaturedRow({
  skuId,
  sku,
  name,
  featured,
  featuredOrder,
  canEdit,
  locale,
}: {
  skuId: string;
  sku: string;
  name: string;
  featured: boolean;
  featuredOrder: number;
  canEdit: boolean;
  locale: 'ar' | 'en';
}) {
  const router = useRouter();
  const [on, setOn] = useState(featured);
  const [order, setOrder] = useState(String(featuredOrder));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);

  async function save(next: { featured?: boolean; featuredOrder?: number }) {
    setBusy(true);
    setErr(null);
    const res = await api(`/api/v1/admin/skus/${skuId}/merchandising`, { method: 'PATCH', body: next });
    setBusy(false);
    if (!res.ok) {
      setErr(res.message);
      return;
    }
    router.refresh();
  }

  return (
    <tr>
      <td dir="ltr" style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>
        {sku}
      </td>
      <td>{name}</td>
      <td>
        <label className="row" style={{ fontWeight: 400, margin: 0 }}>
          <input
            type="checkbox"
            checked={on}
            disabled={!canEdit || busy}
            onChange={(e) => {
              setOn(e.target.checked);
              void save({ featured: e.target.checked });
            }}
            aria-label={L(`تمييز ${sku}`, `Feature ${sku}`)}
          />
          <span>{on ? L('مميز', 'Featured') : L('غير مميز', 'Not featured')}</span>
        </label>
      </td>
      <td>
        <div className="row" style={{ gap: 6 }}>
          <label htmlFor={`ord-${skuId}`} className="sr-only">
            {L('ترتيب العرض', 'Display order')}
          </label>
          <input id={`ord-${skuId}`} type="number" min={0} max={100000} value={order} disabled={!canEdit || busy} onChange={(e) => setOrder(e.target.value)} style={{ inlineSize: 90 }} />
          <button type="button" className="btn btn-small" disabled={!canEdit || busy} onClick={() => save({ featuredOrder: Math.max(0, Math.floor(Number(order) || 0)) })}>
            {L('حفظ الترتيب', 'Save order')}
          </button>
        </div>
        {err && (
          <p role="alert" className="field-error" style={{ margin: 0 }}>
            {err}
          </p>
        )}
      </td>
    </tr>
  );
}

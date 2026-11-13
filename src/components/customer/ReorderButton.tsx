'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client-api';
import { pick, type Loc } from './shared';

type ReportRow = { sku: string; status: 'ADDED' | 'SKIPPED'; qty?: number; reason?: string };

/** CUS-15 / P07: copies the order's lines into the cart at current prices. Shows what was skipped. */
export function ReorderButton({ orderId, locale }: { orderId: string; locale: Loc }) {
  const ar = locale === 'ar';
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<ReportRow[] | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    const res = await api<{ report: ReportRow[]; added: number }>(`/api/v1/orders/${orderId}/reorder`, { method: 'POST' });
    setBusy(false);
    if (!res.ok) {
      setErr(res.message);
      return;
    }
    setReport(res.data.report);
  }

  const added = report?.filter((r) => r.status === 'ADDED').length ?? 0;
  const skipped = report?.filter((r) => r.status === 'SKIPPED') ?? [];

  return (
    <div className="stack">
      <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
        {busy ? (ar ? 'جاري الإضافة…' : 'Adding…') : ar ? 'أعد الطلب إلى السلة' : 'Reorder to cart'}
      </button>
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
      {report && (
        <div className="stack" style={{ gap: 8 }}>
          <p className="alert alert-ok" role="status">
            {ar ? `أُضيف ${added} صنف إلى السلة.` : `${added} item(s) added to your cart.`}
          </p>
          {skipped.length > 0 && (
            <div>
              <strong>{ar ? 'أصناف لم تُضف:' : 'Items not added:'}</strong>
              <ul style={{ paddingInlineStart: 20 }}>
                {skipped.map((s) => (
                  <li key={s.sku}>
                    <span dir="ltr">{s.sku}</span> — {s.reason ?? pick(locale, 'غير متاح', 'unavailable')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link className="btn" href="/cart">
            {ar ? 'عرض السلة' : 'View cart'}
          </Link>
        </div>
      )}
    </div>
  );
}

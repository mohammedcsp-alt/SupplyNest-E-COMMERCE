'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client-api';
import { QtyStepper } from './QuickAdd';

export type CompactRow = {
  id: string;
  sku: string;
  name: string;
  href: string;
  thumb: string | null;
  attrs: string;
  availability: 'AVAILABLE' | 'UNAVAILABLE' | string;
  availabilityLabel: string;
  /** Pre-formatted price for entitled viewers; null otherwise (never sent to anyone else). */
  priceText: string | null;
};

type Result = { sku: string; ok: boolean; reason?: string };

/**
 * Compact B2B view: high-density rows with multi-select and one bulk add.
 * Sends all selected lines to /api/v1/cart/bulk-add in a single request; the server re-checks price, stock and eligibility.
 */
export function BulkCompact({ rows, locale, canBuy, labels }: { rows: CompactRow[]; locale: 'ar' | 'en'; canBuy: boolean; labels: Record<string, string> }) {
  const ar = locale === 'ar';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = rows.length > 0 && allIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  async function addSelected() {
    const lines = rows.filter((r) => selected.has(r.id)).map((r) => ({ sku: r.sku, qty: qty[r.id] ?? 1 }));
    if (lines.length === 0) return;
    setBusy(true);
    setError(null);
    setResults(null);
    const res = await api<{ results: Result[]; added: number }>('/api/v1/cart/bulk-add', { method: 'POST', body: { lines } });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setResults(res.data.results);
    setSelected(new Set());
  }

  const okCount = results?.filter((r) => r.ok).length ?? 0;
  const failCount = results ? results.length - okCount : 0;

  return (
    <div>
      <div className="table-wrap">
        <table className="compact-table" aria-label={labels.tableLabel}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={labels.selectAll} disabled={!canBuy} />
              </th>
              <th style={{ width: 52 }} aria-label={labels.image} />
              <th>{labels.sku}</th>
              <th>{labels.name}</th>
              <th>{labels.attrs}</th>
              <th>{labels.availability}</th>
              {canBuy && <th className="num">{labels.price}</th>}
              {canBuy && <th>{labels.qty}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    disabled={!canBuy}
                    aria-label={`${labels.select} ${r.sku}`}
                  />
                </td>
                <td>
                  <div className="thumb-sm">
                    {r.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.thumb} alt="" loading="lazy" />
                    ) : (
                      <span className="muted" style={{ fontSize: '0.65rem' }}>—</span>
                    )}
                  </div>
                </td>
                <td className="sku">{r.sku}</td>
                <td className="name">
                  <Link href={r.href}>{r.name}</Link>
                </td>
                <td className="muted">{r.attrs}</td>
                <td>
                  <span className={r.availability === 'AVAILABLE' ? 'badge badge-ok' : 'badge'}>{r.availabilityLabel}</span>
                </td>
                {canBuy && <td className="num price">{r.priceText ?? '—'}</td>}
                {canBuy && (
                  <td>
                    <QtyStepper
                      id={`bulk-qty-${r.id}`}
                      value={qty[r.id] ?? 1}
                      onChange={(n) => setQty((prev) => ({ ...prev, [r.id]: n }))}
                      locale={locale}
                      disabled={busy}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canBuy && (
        <div className="bulk-bar" role="region" aria-label={labels.bulkRegion}>
          <span>
            {labels.selectedPrefix} <strong>{selected.size}</strong>
          </span>
          <button type="button" className="btn btn-accent" onClick={addSelected} disabled={busy || selected.size === 0}>
            {busy ? '…' : labels.addSelected}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="alert alert-error" style={{ marginBlockStart: 12 }}>
          {error}
        </p>
      )}
      {results && (
        <div role="status" className={failCount === 0 ? 'alert alert-ok' : 'alert alert-warn'} style={{ marginBlockStart: 12 }}>
          {ar ? `أُضيف ${okCount} صنف إلى السلة` : `${okCount} item(s) added to cart`}
          {failCount > 0 && (ar ? ` — تعذر إضافة ${failCount}: ` : ` — ${failCount} could not be added: `)}
          {failCount > 0 && results.filter((r) => !r.ok).map((r) => `${r.sku} (${r.reason ?? ''})`).join('; ')}{' '}
          <Link href="/cart">{ar ? 'عرض السلة' : 'View cart'}</Link>
        </div>
      )}
    </div>
  );
}

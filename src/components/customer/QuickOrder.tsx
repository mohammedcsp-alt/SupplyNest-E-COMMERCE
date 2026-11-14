'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client-api';
import type { Loc } from './shared';
import { BulkPreview, BulkResults, type AddResult, type Preview } from './BulkPreview';

type Row = { id: number; sku: string; qty: string };

const MAX_ROWS = 25;

/**
 * Quick order (CU-03): type SKU and quantity rows, preview them with the same server preview as bulk paste,
 * then add the reviewed lines to the cart. Nothing is created until the customer reviews the preview.
 */
export function QuickOrder({ locale }: { locale: Loc }) {
  const ar = locale === 'ar';
  const [nextId, setNextId] = useState(3);
  const [rows, setRows] = useState<Row[]>([
    { id: 1, sku: '', qty: '' },
    { id: 2, sku: '', qty: '' },
    { id: 3, sku: '', qty: '' },
  ]);
  const [busy, setBusy] = useState<'preview' | 'add' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [results, setResults] = useState<AddResult[] | null>(null);

  const filled = rows.filter((r) => r.sku.trim() !== '' || r.qty.trim() !== '');

  function update(id: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    if (rows.length >= MAX_ROWS) return;
    setRows((prev) => [...prev, { id: nextId, sku: '', qty: '' }]);
    setNextId((n) => n + 1);
  }

  function removeRow(id: number) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }

  async function previewRows(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // A blank quantity means 1 (the field placeholder); anything else is validated by the server.
    const lines = filled.map((r) => `${r.sku.trim()} ${r.qty.trim() || '1'}`);
    if (lines.length === 0) {
      setErr(ar ? 'أدخل SKU وكمية لصنف واحد على الأقل.' : 'Enter a SKU and quantity for at least one item.');
      return;
    }
    setBusy('preview');
    setErr(null);
    setResults(null);
    const res = await api<Preview>('/api/v1/cart/bulk-preview', { method: 'POST', body: { text: lines.join('\n') } });
    setBusy(null);
    if (!res.ok) {
      setErr(res.message);
      setPreview(null);
      return;
    }
    setPreview(res.data);
  }

  async function addValid() {
    if (!preview || preview.lines.length === 0) return;
    setBusy('add');
    setErr(null);
    const res = await api<{ results: AddResult[]; added: number }>('/api/v1/cart/bulk-add', {
      method: 'POST',
      body: { lines: preview.lines.map((l) => ({ sku: l.sku, qty: l.qty })) },
    });
    setBusy(null);
    if (!res.ok) {
      setErr(res.message);
      return;
    }
    setResults(res.data.results);
    setPreview(null);
    setRows([
      { id: nextId, sku: '', qty: '' },
      { id: nextId + 1, sku: '', qty: '' },
      { id: nextId + 2, sku: '', qty: '' },
    ]);
    setNextId((n) => n + 3);
  }

  return (
    <div className="stack">
      <section className="card" aria-labelledby="quick-entry">
        <h2 id="quick-entry" className="step-title" style={{ marginBlockStart: 0 }}>
          {ar ? 'أدخل الأصناف' : 'Enter items'}
        </h2>
        <form onSubmit={previewRows} noValidate>
          <div className="quick-head" aria-hidden="true">
            <span>{ar ? 'رمز SKU' : 'SKU'}</span>
            <span>{ar ? 'الكمية' : 'Qty'}</span>
            <span />
          </div>
          <div className="quick-rows">
            {rows.map((r, idx) => (
              <div key={r.id} className="quick-row">
                <label className="sr-only" htmlFor={`quick-sku-${r.id}`}>
                  {ar ? `رمز SKU للسطر ${idx + 1}` : `SKU for row ${idx + 1}`}
                </label>
                <input
                  id={`quick-sku-${r.id}`}
                  dir="ltr"
                  value={r.sku}
                  placeholder={ar ? 'مثال: SKU-001' : 'e.g. SKU-001'}
                  onChange={(e) => update(r.id, { sku: e.target.value })}
                  autoComplete="off"
                />
                <label className="sr-only" htmlFor={`quick-qty-${r.id}`}>
                  {ar ? `الكمية للسطر ${idx + 1}` : `Quantity for row ${idx + 1}`}
                </label>
                <input
                  id={`quick-qty-${r.id}`}
                  dir="ltr"
                  inputMode="numeric"
                  value={r.qty}
                  placeholder="1"
                  onChange={(e) => update(r.id, { qty: e.target.value.replace(/[^0-9]/g, '').slice(0, 6) })}
                />
                <button type="button" className="btn btn-ghost btn-small" onClick={() => removeRow(r.id)} disabled={rows.length <= 1} aria-label={ar ? `إزالة السطر ${idx + 1}` : `Remove row ${idx + 1}`}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginBlockStart: 12, justifyContent: 'space-between' }}>
            <button type="button" className="btn btn-small" onClick={addRow} disabled={rows.length >= MAX_ROWS}>
              {ar ? `+ سطر (${rows.length}/${MAX_ROWS})` : `+ Add row (${rows.length}/${MAX_ROWS})`}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy !== null || filled.length === 0}>
              {busy === 'preview' ? '…' : ar ? 'معاينة' : 'Preview'}
            </button>
          </div>
          <p className="muted" style={{ fontSize: '0.9rem', marginBlockEnd: 0 }}>
            {ar ? 'الأسعار تُحسب حسب مستوى حسابك عند إضافة الأصناف إلى السلة. لن يُنشأ أي طلب هنا.' : 'Prices follow your account level when items reach the cart. Nothing is ordered here.'}{' '}
            <Link href="/bulk-order">{ar ? 'لصق قائمة أو رفع ملف' : 'Paste a list or upload a file'}</Link>
          </p>
        </form>
      </section>

      {err && (
        <p className="alert alert-error" role="alert">
          {err}
        </p>
      )}

      {preview && <BulkPreview locale={locale} preview={preview} busy={busy === 'add'} onAdd={addValid} />}

      {results && <BulkResults locale={locale} results={results} />}
    </div>
  );
}

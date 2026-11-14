'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client-api';
import type { Loc } from './shared';
import { BulkPreview, BulkResults, type AddResult, type Preview } from './BulkPreview';

/**
 * Bulk ordering into the CART only (P05 / P06 / CUS-07 / CUS-08). Nothing here creates an order.
 * Card A pastes "SKU qty" lines; card B uploads a SKU,QTY CSV/XLSX (eligible = active, approved customers,
 * enforced by the page gate and the API). Both return a preview that the customer reviews before anything is added.
 */
export function BulkOrder({ locale }: { locale: Loc }) {
  const ar = locale === 'ar';
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'paste' | 'upload' | 'add' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [results, setResults] = useState<AddResult[] | null>(null);

  async function previewPaste(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy('paste');
    setErr(null);
    setResults(null);
    const res = await api<Preview>('/api/v1/cart/bulk-preview', { method: 'POST', body: { text } });
    setBusy(null);
    if (!res.ok) {
      setErr(res.message);
      setPreview(null);
      return;
    }
    setPreview(res.data);
  }

  async function previewUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setErr(ar ? 'اختر ملفًا أولًا.' : 'Choose a file first.');
      return;
    }
    setBusy('upload');
    setErr(null);
    setResults(null);
    const form = new FormData();
    form.append('file', file);
    const res = await api<Preview>('/api/v1/cart/bulk-preview', { method: 'POST', form });
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
    setText('');
    setFile(null);
  }

  return (
    <div className="stack">
      <div className="bulk-grid">
        <section className="card" aria-labelledby="bulk-paste">
          <h2 id="bulk-paste" className="step-title" style={{ marginBlockStart: 0 }}>
            <span className="step-num" aria-hidden="true">A</span>
            {ar ? 'لصق الأصناف' : 'Paste items'}
          </h2>
          <form onSubmit={previewPaste} noValidate>
            <div className="field">
              <label htmlFor="bulk-text">{ar ? 'سطر واحد لكل صنف، بالصيغة: SKU الكمية' : 'One item per line, format: SKU qty'}</label>
              <textarea
                id="bulk-text"
                dir="ltr"
                rows={7}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'SKU-001 2\nSKU-002 5'}
                aria-describedby="bulk-text-help"
              />
              <div id="bulk-text-help" className="field-help">
                {ar ? 'حتى 500 سطر. الفاصل: مسافة أو تاب أو فاصلة أو فاصلة منقوطة.' : 'Up to 500 lines. Separate with a space, tab, comma or semicolon.'}
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy !== null || text.trim() === ''}>
              {busy === 'paste' ? '…' : ar ? 'معاينة' : 'Preview'}
            </button>
          </form>
        </section>

        <section className="card" aria-labelledby="bulk-upload">
          <h2 id="bulk-upload" className="step-title" style={{ marginBlockStart: 0 }}>
            <span className="step-num" aria-hidden="true">B</span>
            {ar ? 'رفع ملف Excel' : 'Upload an Excel file'}
          </h2>
          <form onSubmit={previewUpload} noValidate>
            <div className="field">
              <label htmlFor="bulk-file">{ar ? 'ملف CSV أو XLSX بالأعمدة: SKU,QTY' : 'CSV or XLSX file with the columns: SKU,QTY'}</label>
              <input id="bulk-file" type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-describedby="bulk-file-help" />
              <div id="bulk-file-help" className="field-help">
                {ar ? 'العمود الأول SKU والثاني QTY، ويُكتب كل صنف في صف مستقل. تظهر الأخطاء سطرًا بسطر في المعاينة.' : 'Column 1 is SKU, column 2 is QTY, one item per row. Errors are listed row by row in the preview.'}
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy !== null || !file}>
              {busy === 'upload' ? '…' : ar ? 'معاينة الملف' : 'Preview file'}
            </button>
          </form>
        </section>
      </div>

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

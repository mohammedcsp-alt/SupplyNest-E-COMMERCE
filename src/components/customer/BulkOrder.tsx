'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client-api';
import type { Loc } from './shared';

type PreviewLine = { sku: string; skuId: string; nameEn: string; qty: number; sourceRows: number[]; availableNow: boolean; qualityCode: string | null };
type PreviewIssue = { rowNumber: number; input: string; code: string; message: string };
type Preview = { lines: PreviewLine[]; issues: PreviewIssue[]; mergedDuplicates: number; rowsRead: number };
type AddResult = { sku: string; ok: boolean; reason?: string };

/**
 * Bulk ordering into the CART only (P05 / P06 / CUS-07 / CUS-08). Nothing here creates an order.
 * Step A pastes "SKU qty" lines; step B uploads a SKU,QTY CSV/XLSX. Both return a preview that the customer reviews
 * before anything is added to the cart.
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

  const addedCount = results?.filter((r) => r.ok).length ?? 0;

  return (
    <div className="stack">
      <section className="card" aria-labelledby="bulk-paste">
        <h2 id="bulk-paste" style={{ marginBlockStart: 0 }}>
          {ar ? 'أ. لصق الأصناف' : 'A. Paste items'}
        </h2>
        <form onSubmit={previewPaste} noValidate>
          <div className="field">
            <label htmlFor="bulk-text">{ar ? 'سطر واحد لكل صنف، بالصيغة: SKU الكمية' : 'One item per line, format: SKU qty'}</label>
            <textarea
              id="bulk-text"
              dir="ltr"
              rows={6}
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
        <h2 id="bulk-upload" style={{ marginBlockStart: 0 }}>
          {ar ? 'ب. رفع ملف' : 'B. Upload a file'}
        </h2>
        <form onSubmit={previewUpload} noValidate>
          <div className="field">
            <label htmlFor="bulk-file">{ar ? 'ملف CSV أو XLSX بالأعمدة: SKU,QTY' : 'CSV or XLSX file with the columns: SKU,QTY'}</label>
            <input id="bulk-file" type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <div className="field-help">
              {ar ? 'العمود الأول SKU والثاني QTY، ويُكتب كل صنف في صف مستقل.' : 'Column 1 is SKU, column 2 is QTY, one item per row.'}
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy !== null || !file}>
            {busy === 'upload' ? '…' : ar ? 'معاينة الملف' : 'Preview file'}
          </button>
        </form>
      </section>

      {err && (
        <p className="alert alert-error" role="alert">
          {err}
        </p>
      )}

      {preview && (
        <section className="card" aria-labelledby="bulk-preview">
          <h2 id="bulk-preview" style={{ marginBlockStart: 0 }}>
            {ar ? 'نتيجة المعاينة' : 'Preview'}
          </h2>
          <p className="muted">
            {ar
              ? `سطور مقروءة: ${preview.rowsRead} · صالحة: ${preview.lines.length} · مشكلات: ${preview.issues.length} · مكررات دُمجت: ${preview.mergedDuplicates}`
              : `Rows read: ${preview.rowsRead} · valid: ${preview.lines.length} · issues: ${preview.issues.length} · duplicates merged: ${preview.mergedDuplicates}`}
          </p>

          <h3>{ar ? 'أصناف صالحة' : 'Valid items'}</h3>
          {preview.lines.length === 0 ? (
            <p className="muted">{ar ? 'لا توجد أصناف صالحة.' : 'No valid items.'}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{ar ? 'رمز SKU' : 'SKU'}</th>
                    <th scope="col">{ar ? 'الاسم' : 'Name'}</th>
                    <th scope="col">{ar ? 'الكمية' : 'Qty'}</th>
                    <th scope="col">{ar ? 'الصفوف المصدر' : 'Source rows'}</th>
                    <th scope="col">{ar ? 'التوفر' : 'Stock'}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((l) => (
                    <tr key={l.skuId}>
                      <td dir="ltr">{l.sku}</td>
                      <td>{l.nameEn}</td>
                      <td>{l.qty}</td>
                      <td>{l.sourceRows.join(', ')}</td>
                      <td>{l.availableNow ? (ar ? 'متوفر' : 'Available') : ar ? 'الكمية أكبر من المتوفر' : 'Exceeds stock'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.issues.length > 0 && (
            <>
              <h3>{ar ? 'مشكلات' : 'Issues'}</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{ar ? 'رقم السطر' : 'Row'}</th>
                      <th scope="col">{ar ? 'المدخل' : 'Input'}</th>
                      <th scope="col">{ar ? 'الرسالة' : 'Message'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.issues.map((i, idx) => (
                      <tr key={`${i.rowNumber}-${i.code}-${idx}`}>
                        <td>{i.rowNumber}</td>
                        <td dir="ltr">{i.input}</td>
                        <td>{i.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <button type="button" className="btn btn-primary" onClick={addValid} disabled={busy !== null || preview.lines.length === 0}>
            {busy === 'add' ? '…' : ar ? 'أضف الأصناف الصالحة إلى السلة' : 'Add valid lines to cart'}
          </button>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            {ar ? 'لن يُنشأ أي طلب من هذه الصفحة. ستراجع السلة قبل الدفع.' : 'This does not create an order. You review the cart before checkout.'}
          </p>
        </section>
      )}

      {results && (
        <section className="card" aria-live="polite">
          <p className="alert alert-ok" role="status">
            {ar ? `أُضيف ${addedCount} من ${results.length} صنف إلى السلة.` : `${addedCount} of ${results.length} item(s) added to your cart.`}{' '}
            <Link href="/cart">{ar ? 'عرض السلة' : 'View cart'}</Link>
          </p>
          {results.some((r) => !r.ok) && (
            <ul>
              {results
                .filter((r) => !r.ok)
                .map((r) => (
                  <li key={r.sku}>
                    <span dir="ltr">{r.sku}</span>: {r.reason ?? (ar ? 'تعذّر الإضافة' : 'Could not add')}
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

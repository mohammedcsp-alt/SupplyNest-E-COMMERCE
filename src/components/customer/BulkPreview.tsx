'use client';

import Link from 'next/link';
import type { Loc } from './shared';

export type PreviewLine = { sku: string; skuId: string; nameEn: string; qty: number; sourceRows: number[]; availableNow: boolean; qualityCode: string | null };
export type PreviewIssue = { rowNumber: number; input: string; code: string; message: string };
export type Preview = { lines: PreviewLine[]; issues: PreviewIssue[]; mergedDuplicates: number; rowsRead: number };
export type AddResult = { sku: string; ok: boolean; reason?: string };

/**
 * Shared preview panel for the bulk order, Excel upload and quick order pages. Shows valid lines, per-row issues
 * and the explicit "add to cart" action. Nothing here creates an order.
 */
export function BulkPreview({ locale, preview, busy, onAdd }: { locale: Loc; preview: Preview; busy: boolean; onAdd: () => void }) {
  const ar = locale === 'ar';
  return (
    <section className="card" aria-labelledby="bulk-preview">
      <h2 id="bulk-preview" className="step-title" style={{ marginBlockStart: 0 }}>
        {ar ? 'نتيجة المعاينة' : 'Preview'}
      </h2>
      <div className="kv-strip" role="list">
        <div role="listitem">
          <span className="kpi-label">{ar ? 'سطور مقروءة' : 'Rows read'}</span>
          <strong>{preview.rowsRead}</strong>
        </div>
        <div role="listitem">
          <span className="kpi-label">{ar ? 'صالحة' : 'Valid'}</span>
          <strong>{preview.lines.length}</strong>
        </div>
        <div role="listitem">
          <span className="kpi-label">{ar ? 'مشكلات' : 'Issues'}</span>
          <strong>{preview.issues.length}</strong>
        </div>
        <div role="listitem">
          <span className="kpi-label">{ar ? 'مكررات دُمجت' : 'Duplicates merged'}</span>
          <strong>{preview.mergedDuplicates}</strong>
        </div>
      </div>

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
                  <td>
                    <span className={`badge ${l.availableNow ? 'badge-ok' : 'badge-warn'}`}>
                      {l.availableNow ? (ar ? 'متوفر' : 'Available') : ar ? 'الكمية أكبر من المتوفر' : 'Exceeds stock'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview.issues.length > 0 && (
        <>
          <h3>{ar ? 'مشكلات تحتاج مراجعة' : 'Rows to fix'}</h3>
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

      <div className="row" style={{ marginBlockStart: 12, justifyContent: 'space-between' }}>
        <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
          {ar ? 'لن يُنشأ أي طلب من هذه الصفحة. ستراجع السلة قبل الدفع.' : 'This does not create an order. You review the cart before checkout.'}
        </p>
        <button type="button" className="btn btn-primary" onClick={onAdd} disabled={busy || preview.lines.length === 0}>
          {busy ? '…' : ar ? 'أضف الأصناف الصالحة إلى السلة' : 'Add valid lines to cart'}
        </button>
      </div>
    </section>
  );
}

/** Per-line result after adding reviewed lines to the cart. */
export function BulkResults({ locale, results }: { locale: Loc; results: AddResult[] }) {
  const ar = locale === 'ar';
  const addedCount = results.filter((r) => r.ok).length;
  return (
    <section className="card" aria-live="polite">
      <p className="alert alert-ok" role="status" style={{ margin: 0 }}>
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
  );
}

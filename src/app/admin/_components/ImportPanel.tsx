'use client';

import { useId, useState, type FormEvent } from 'react';
import { api, type ApiErr } from '@/lib/client-api';

type Issue = { rowNumber: number; field?: string | null; code: string; message: string };
type Preview = {
  importId: string;
  status: 'PREVIEW_VALID' | 'PREVIEW_INVALID';
  freshness?: 'FRESH' | 'STALE' | 'UNKNOWN';
  extractedAt?: string | null;
  summary?: Record<string, unknown>;
  staleSkuCount?: number;
  errorCount: number;
  errors: Issue[];
};

/**
 * Upload -> preview -> commit for product and price files. The server re-validates on commit and enforces the
 * freshness gate; this panel only collects the acknowledgement or the override reason the gate asks for.
 */
export function ImportPanel({
  type,
  canCommit,
  canOverride,
  locale,
}: {
  type: 'products' | 'prices';
  canCommit: boolean;
  canOverride: boolean;
  locale: 'ar' | 'en';
}) {
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErr | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);

  async function onUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(null);
    const form = new FormData(e.currentTarget);
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setError({ ok: false, status: 400, code: 'VALIDATION_ERROR', message: L('اختر ملفاً.', 'Choose a file.') });
      return;
    }
    setBusy(true);
    const body = new FormData();
    body.append('file', file);
    const res = await api<Preview>(`/api/v1/admin/imports/${type}/preview`, { method: 'POST', form: body });
    setBusy(false);
    if (!res.ok) {
      setError(res);
      setPreview(null);
      return;
    }
    setPreview(res.data);
  }

  async function onCommit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!preview) return;
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {};
    if (preview.freshness === 'UNKNOWN') payload.acknowledgeUnknownFreshness = form.get('ack') === 'on';
    if (preview.freshness === 'STALE') {
      const reason = (form.get('overrideReason') ?? '').toString().trim();
      if (reason) payload.override = { reason };
    }
    setBusy(true);
    const res = await api(`/api/v1/admin/imports/${type}/${preview.importId}/commit`, { method: 'POST', body: payload });
    setBusy(false);
    if (!res.ok) {
      setError(res);
      return;
    }
    setDone(L('تم اعتماد الاستيراد.', 'Import committed.'));
    setPreview(null);
  }

  const staleNeedsOverride = preview?.freshness === 'STALE';
  const canSubmitStale = !staleNeedsOverride || canOverride;

  return (
    <div>
      {error && (
        <div className="alert alert-error" role="alert">
          {error.message}
          {error.details !== undefined && (
            <details>
              <summary>{L('تفاصيل', 'Details')}</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(error.details, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
      {done && <div className="alert alert-ok" role="status">{done}</div>}

      <form id={formId} onSubmit={onUpload} noValidate aria-busy={busy}>
        <div className="field">
          <label htmlFor={`${formId}-file`}>{L('ملف CSV أو XLSX', 'CSV or XLSX file')}</label>
          <input id={`${formId}-file`} name="file" type="file" accept=".csv,.xlsx,text/csv" disabled={busy} />
          <div className="field-help">{L('يتم التحقق من الملف كاملاً قبل أي تغيير. لا يُطبَّق شيء في مرحلة المعاينة.', 'The whole file is validated before anything changes. Preview applies nothing.')}</div>
        </div>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? L('جارٍ المعاينة…', 'Previewing…') : L('معاينة الملف', 'Preview file')}
        </button>
      </form>

      {preview && (
        <div className="stack" style={{ marginBlockStart: 16 }}>
          <p>
            <strong>{L('النتيجة:', 'Result:')}</strong> {preview.status.replace(/_/g, ' ')} · {L('الحداثة:', 'Freshness:')} {preview.freshness ?? '—'}
            {preview.extractedAt ? ` · ${L('وقت الاستخراج', 'extracted')} ${preview.extractedAt}` : ''}
          </p>
          {preview.summary && (
            <dl className="row" style={{ gap: 16 }}>
              {Object.entries(preview.summary)
                .filter(([, v]) => typeof v !== 'object')
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="muted">{k}</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>{String(v)}</dd>
                  </div>
                ))}
            </dl>
          )}
          {preview.errorCount > 0 && (
            <>
              <p className="field-error">
                {L(`أخطاء الصفوف: ${preview.errorCount}`, `Row errors: ${preview.errorCount}`)}
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{L('الصف', 'Row')}</th>
                      <th>{L('الحقل', 'Field')}</th>
                      <th>{L('الرمز', 'Code')}</th>
                      <th>{L('الرسالة', 'Message')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.errors.map((i, idx) => (
                      <tr key={`${i.rowNumber}-${i.code}-${idx}`}>
                        <td className="num">{i.rowNumber}</td>
                        <td>{i.field ?? '—'}</td>
                        <td>{i.code}</td>
                        <td>{i.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {preview.status === 'PREVIEW_VALID' && canCommit && (
            <form id={`${formId}-commit`} onSubmit={onCommit} noValidate>
              {preview.freshness === 'UNKNOWN' && (
                <div className="field">
                  <label className="row" style={{ fontWeight: 400 }}>
                    <input type="checkbox" name="ack" /> {L('أفهم أن تاريخ الملف غير معروف وأقبل اعتماده.', 'I understand the file date is unknown and accept committing it.')}
                  </label>
                </div>
              )}
              {staleNeedsOverride && (
                <div className="field">
                  {canOverride ? (
                    <>
                      <label htmlFor={`${formId}-override`}>{L('سبب اعتماد ملف قديم (مدير)', 'Reason for committing a stale file (manager)')} *</label>
                      <textarea id={`${formId}-override`} name="overrideReason" required minLength={3} maxLength={500} />
                    </>
                  ) : (
                    <div className="alert alert-warn" role="status">
                      {L('هذا الملف قديم. يتطلب اعتماده صلاحية تجاوز الحداثة (import.override_stale).', 'This file is stale. Committing it requires the stale-override permission (import.override_stale).')}
                    </div>
                  )}
                </div>
              )}
              <button type="submit" className="btn btn-primary" disabled={busy || !canSubmitStale}>
                {busy ? L('جارٍ الاعتماد…', 'Committing…') : L('اعتماد الاستيراد', 'Commit import')}
              </button>
            </form>
          )}
          {preview.status === 'PREVIEW_INVALID' && (
            <p className="muted">{L('لا يمكن اعتماد ملف فيه أخطاء. صحّح الملف وأعد رفعه.', 'A file with errors cannot be committed. Fix the file and upload again.')}</p>
          )}
        </div>
      )}
    </div>
  );
}

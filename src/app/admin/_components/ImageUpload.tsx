'use client';

import { useId, useState, type FormEvent } from 'react';
import { api, type ApiErr } from '@/lib/client-api';

/** SKU image limit enforced by the server (MAX_IMAGES_PER_SKU). The UI disables upload at the limit. */
export const SKU_IMAGE_LIMIT = 10;

export function ImageUpload({ skuId, count, locale }: { skuId: string; count: number; locale: 'ar' | 'en' }) {
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErr | null>(null);
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);
  const full = count >= SKU_IMAGE_LIMIT;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setError({ ok: false, status: 400, code: 'VALIDATION_ERROR', message: L('اختر ملف صورة.', 'Choose an image file.') });
      return;
    }
    const body = new FormData();
    body.append('file', file);
    const alt = (form.get('altText') ?? '').toString().trim();
    if (alt) body.append('altText', alt.slice(0, 200));
    setBusy(true);
    const res = await api(`/api/v1/admin/skus/${skuId}/images`, { method: 'POST', form: body });
    setBusy(false);
    if (!res.ok) {
      setError(res);
      return;
    }
    window.location.reload();
  }

  return (
    <form id={formId} onSubmit={onSubmit} noValidate aria-busy={busy}>
      <p className="muted" aria-live="polite">
        {L(`الصور: ${count} من ${SKU_IMAGE_LIMIT}`, `Images: ${count} of ${SKU_IMAGE_LIMIT}`)}
      </p>
      {error && <div className="alert alert-error" role="alert">{error.message}</div>}
      <div className="field">
        <label htmlFor={`${formId}-file`}>{L('ملف الصورة (JPEG أو PNG أو WebP، حتى 5 ميغابايت)', 'Image file (JPEG, PNG or WebP, up to 5 MB)')}</label>
        <input id={`${formId}-file`} name="file" type="file" accept="image/jpeg,image/png,image/webp" disabled={full || busy} />
      </div>
      <div className="field">
        <label htmlFor={`${formId}-alt`}>{L('نص بديل (اختياري)', 'Alt text (optional)')}</label>
        <input id={`${formId}-alt`} name="altText" type="text" maxLength={200} disabled={full || busy} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={full || busy}>
        {full ? L('بلغ الحد الأقصى', 'Limit reached') : busy ? L('جارٍ الرفع…', 'Uploading…') : L('رفع الصورة', 'Upload image')}
      </button>
    </form>
  );
}

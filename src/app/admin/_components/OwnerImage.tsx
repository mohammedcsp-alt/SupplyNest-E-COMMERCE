'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client-api';

/**
 * Upload, replace or remove the image of a category, brand or banner (V3.3).
 * The server validates the file bytes (JPEG/PNG/WebP, 5 MB) and audits every change. The preview uses the public image URL.
 */
export function OwnerImage({
  endpoint,
  previewUrl,
  hasImage,
  locale,
  label,
}: {
  endpoint: string;
  previewUrl: string;
  hasImage: boolean;
  locale: 'ar' | 'en';
  label: string;
}) {
  const inputId = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setMsg({ tone: 'error', text: L('اختر ملف صورة.', 'Choose an image file.') });
      return;
    }
    const body = new FormData();
    body.append('file', file);
    setBusy(true);
    setMsg(null);
    const res = await api(endpoint, { method: 'POST', form: body });
    setBusy(false);
    if (!res.ok) {
      setMsg({ tone: 'error', text: res.message });
      return;
    }
    setMsg({ tone: 'ok', text: L('تم حفظ الصورة.', 'Image saved.') });
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(L('إزالة الصورة؟ السجل نفسه يبقى.', 'Remove the image? The record itself is kept.'))) return;
    setBusy(true);
    setMsg(null);
    const res = await api(endpoint, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      setMsg({ tone: 'error', text: res.message });
      return;
    }
    setMsg({ tone: 'ok', text: L('تمت إزالة الصورة.', 'Image removed.') });
    router.refresh();
  }

  return (
    <div className="owner-image">
      <div className="owner-image-preview">
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={label} />
        ) : (
          <span className="muted">{L('بلا صورة', 'No image')}</span>
        )}
      </div>
      <div className="owner-image-controls">
        <form onSubmit={upload} className="owner-image-form">
          <label htmlFor={inputId} className="sr-only">
            {label}
          </label>
          <input id={inputId} type="file" name="file" accept="image/jpeg,image/png,image/webp" />
          <button type="submit" className="btn btn-small btn-primary" disabled={busy}>
            {hasImage ? L('استبدال', 'Replace') : L('رفع', 'Upload')}
          </button>
        </form>
        {hasImage && (
          <button type="button" className="btn btn-small btn-danger owner-image-remove" onClick={remove} disabled={busy}>
            {L('إزالة الصورة', 'Remove image')}
          </button>
        )}
        <span className="field-help">{L('JPEG أو PNG أو WebP، حتى 5 ميغابايت.', 'JPEG, PNG or WebP, up to 5 MB.')}</span>
        {msg && (
          <p role={msg.tone === 'error' ? 'alert' : 'status'} className={msg.tone === 'error' ? 'field-error' : 'muted'} style={{ margin: 0 }}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}

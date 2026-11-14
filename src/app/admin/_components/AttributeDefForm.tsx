'use client';

import { useId, useState, type FormEvent } from 'react';
import { api, type ApiErr } from '@/lib/client-api';

/** Adds or updates one attribute definition on a category. Options are entered as a comma-separated list for ENUM. */
export function AttributeDefForm({ categoryId, locale }: { categoryId: string; locale: 'ar' | 'en' }) {
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErr | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    const form = new FormData(e.currentTarget);
    const dataType = (form.get('dataType') ?? 'TEXT').toString();
    const unit = (form.get('unit') ?? '').toString().trim();
    const options = (form.get('options') ?? '')
      .toString()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await api(`/api/v1/admin/categories/${categoryId}/attributes`, {
      method: 'POST',
      body: {
        key: (form.get('key') ?? '').toString().trim(),
        labelAr: (form.get('labelAr') ?? '').toString().trim(),
        labelEn: (form.get('labelEn') ?? '').toString().trim(),
        dataType,
        unit: unit || null,
        options: dataType === 'ENUM' ? options : null,
        filterable: form.get('filterable') === 'on',
        sortOrder: Number(form.get('sortOrder') ?? 0) || 0,
      },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res);
      return;
    }
    setOk(L('تم حفظ الخاصية. أعد تحميل الصفحة لرؤيتها.', 'Attribute saved. Reload the page to see it.'));
    (e.currentTarget as HTMLFormElement).reset();
  }

  return (
    <div className="cat-form-grid">
      <form id={formId} onSubmit={onSubmit} noValidate aria-busy={busy}>
        {error && <div className="alert alert-error" role="alert">{error.message}</div>}
        {ok && <div className="alert alert-ok" role="status">{ok}</div>}
        <div className="field">
          <label htmlFor={`${formId}-key`}>{L('المفتاح (snake_case)', 'Key (snake_case)')} *</label>
          <input id={`${formId}-key`} name="key" required pattern="[a-z][a-z0-9_]{1,59}" placeholder="size_mm" />
        </div>
        <div className="field">
          <label htmlFor={`${formId}-labelAr`}>{L('الاسم بالعربية', 'Label (Arabic)')} *</label>
          <input id={`${formId}-labelAr`} name="labelAr" required maxLength={120} dir="rtl" />
        </div>
        <div className="field">
          <label htmlFor={`${formId}-labelEn`}>{L('الاسم بالإنجليزية', 'Label (English)')} *</label>
          <input id={`${formId}-labelEn`} name="labelEn" required maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor={`${formId}-dataType`}>{L('النوع', 'Type')}</label>
          <select id={`${formId}-dataType`} name="dataType" defaultValue="TEXT">
            <option value="TEXT">TEXT</option>
            <option value="NUMBER">NUMBER</option>
            <option value="BOOLEAN">BOOLEAN</option>
            <option value="ENUM">ENUM</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${formId}-unit`}>{L('الوحدة', 'Unit')}</label>
          <input id={`${formId}-unit`} name="unit" maxLength={20} placeholder="mm" />
        </div>
        <div className="field">
          <label htmlFor={`${formId}-options`}>{L('الخيارات (للنوع ENUM)', 'Options (ENUM only)')}</label>
          <input id={`${formId}-options`} name="options" placeholder="S, M, L" />
        </div>
        <div className="field">
          <label htmlFor={`${formId}-sort`}>{L('الترتيب', 'Sort order')}</label>
          <input id={`${formId}-sort`} name="sortOrder" type="number" min={0} max={1000} defaultValue={0} />
        </div>
        <div className="field">
          <label className="row" style={{ fontWeight: 400 }}>
            <input type="checkbox" name="filterable" /> {L('قابلة للتصفية', 'Filterable')}
          </label>
        </div>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? L('جارٍ الحفظ…', 'Saving…') : L('حفظ الخاصية', 'Save attribute')}
        </button>
      </form>
    </div>
  );
}

'use client';

import { useId, useState, type FormEvent } from 'react';
import { api, type ApiErr } from '@/lib/client-api';

export type AttributeInput = {
  key: string;
  labelAr: string;
  labelEn: string;
  dataType: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'ENUM';
  unit: string | null;
  options: string[] | null;
  required: boolean;
  value: string | null;
};

/** Typed attribute values for one SKU, built from the category's attribute definitions. Empty optional values clear. */
export function AttributesForm({ skuId, attributes, locale }: { skuId: string; attributes: AttributeInput[]; locale: 'ar' | 'en' }) {
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErr | null>(null);
  const [ok, setOk] = useState(false);
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(false);
    const form = new FormData(e.currentTarget);
    const values: Record<string, string | number | boolean | null> = {};
    for (const a of attributes) {
      if (a.dataType === 'BOOLEAN') {
        values[a.key] = form.get(a.key) === 'on';
        continue;
      }
      const raw = (form.get(a.key) ?? '').toString().trim();
      if (raw === '') {
        values[a.key] = null;
      } else if (a.dataType === 'NUMBER') {
        values[a.key] = Number(raw);
      } else {
        values[a.key] = raw;
      }
    }
    const res = await api(`/api/v1/admin/skus/${skuId}/attributes`, { method: 'PUT', body: { values } });
    setBusy(false);
    if (!res.ok) {
      setError(res);
      return;
    }
    setOk(true);
  }

  if (attributes.length === 0) {
    return <p className="muted">{L('لا توجد خصائص معرّفة لهذه الفئة. أضفها من صفحة الفئات.', 'No attributes are defined for this category. Add them on the Categories page.')}</p>;
  }

  return (
    <form id={formId} onSubmit={onSubmit} noValidate aria-busy={busy}>
      {error && <div className="alert alert-error" role="alert">{error.message}</div>}
      {ok && <div className="alert alert-ok" role="status">{L('تم حفظ الخصائص.', 'Attributes saved.')}</div>}
      {attributes.map((a) => {
        const id = `${formId}-${a.key}`;
        const label = locale === 'ar' ? a.labelAr : a.labelEn;
        if (a.dataType === 'BOOLEAN') {
          return (
            <div className="field" key={a.key}>
              <label className="row" style={{ fontWeight: 400 }}>
                <input type="checkbox" id={id} name={a.key} defaultChecked={a.value === 'true'} /> {label}
              </label>
            </div>
          );
        }
        return (
          <div className="field" key={a.key}>
            <label htmlFor={id}>
              {label}
              {a.unit ? ` (${a.unit})` : ''}
              {a.required ? ' *' : ''}
            </label>
            {a.dataType === 'ENUM' ? (
              <select id={id} name={a.key} defaultValue={a.value ?? ''} required={a.required}>
                <option value="">—</option>
                {(a.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input id={id} name={a.key} type={a.dataType === 'NUMBER' ? 'number' : 'text'} step="any" defaultValue={a.value ?? ''} required={a.required} maxLength={a.dataType === 'TEXT' ? 500 : undefined} />
            )}
          </div>
        );
      })}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? L('جارٍ الحفظ…', 'Saving…') : L('حفظ الخصائص', 'Save attributes')}
      </button>
    </form>
  );
}

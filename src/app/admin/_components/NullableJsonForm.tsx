'use client';

import { useId, useState, type FormEvent } from 'react';
import { api, fieldErrorsOf, type ApiErr } from '@/lib/client-api';

/**
 * JSON form for admin edits where an empty select must be sent as null (clearing brand, parent category, ...).
 * ApiForm omits empty optional fields, which would leave the old value in place; this variant sends null instead.
 */
export type NullableField = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'textarea' | 'select' | 'checkbox';
  required?: boolean;
  nullable?: boolean;
  options?: Array<{ value: string; label: string }>;
  defaultValue?: string | number | boolean | null;
  help?: string;
};

export function NullableJsonForm(props: {
  endpoint: string;
  method?: 'PUT' | 'PATCH' | 'POST';
  fields: NullableField[];
  submitLabel: string;
  successMessage: string;
  busyLabel: string;
  locale: 'ar' | 'en';
}) {
  const { endpoint, method = 'PATCH', fields, submitLabel, successMessage, busyLabel } = props;
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErr | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setOk(null);
    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.type === 'checkbox') {
        body[f.name] = form.get(f.name) === 'on';
        continue;
      }
      const raw = (form.get(f.name) ?? '').toString().trim();
      if (f.type === 'number') {
        body[f.name] = raw === '' ? (f.nullable ? null : undefined) : Number(raw);
      } else if (raw === '') {
        if (f.nullable) body[f.name] = null;
        else if (f.required) body[f.name] = '';
      } else {
        body[f.name] = raw;
      }
    }
    const res = await api(endpoint, { method, body });
    setBusy(false);
    if (!res.ok) {
      setError(res);
      setFieldErrors(fieldErrorsOf(res));
      return;
    }
    setOk(successMessage);
    window.location.reload();
  }

  return (
    <form id={formId} onSubmit={onSubmit} noValidate aria-busy={busy}>
      {error && (
        <div className="alert alert-error" role="alert">
          {error.message}
        </div>
      )}
      {ok && (
        <div className="alert alert-ok" role="status">
          {ok}
        </div>
      )}
      {fields.map((f) => {
        const id = `${formId}-${f.name}`;
        const errId = `${id}-err`;
        return (
          <div className="field" key={f.name}>
            {f.type !== 'checkbox' && (
              <label htmlFor={id}>
                {f.label}
                {f.required ? ' *' : ''}
              </label>
            )}
            {f.type === 'textarea' ? (
              <textarea id={id} name={f.name} defaultValue={f.defaultValue === null || f.defaultValue === undefined ? '' : String(f.defaultValue)} required={f.required} aria-invalid={fieldErrors[f.name] ? true : undefined} aria-describedby={fieldErrors[f.name] ? errId : undefined} />
            ) : f.type === 'select' ? (
              <select id={id} name={f.name} defaultValue={f.defaultValue === null || f.defaultValue === undefined ? '' : String(f.defaultValue)} required={f.required} aria-invalid={fieldErrors[f.name] ? true : undefined}>
                <option value="">—</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'checkbox' ? (
              <label className="row" style={{ fontWeight: 400 }}>
                <input type="checkbox" id={id} name={f.name} defaultChecked={!!f.defaultValue} /> {f.label}
              </label>
            ) : (
              <input
                id={id}
                name={f.name}
                type={f.type ?? 'text'}
                defaultValue={f.defaultValue === null || f.defaultValue === undefined ? '' : String(f.defaultValue)}
                required={f.required}
                aria-invalid={fieldErrors[f.name] ? true : undefined}
                aria-describedby={fieldErrors[f.name] ? errId : undefined}
                inputMode={f.type === 'number' ? 'numeric' : undefined}
              />
            )}
            {f.help && <div className="field-help">{f.help}</div>}
            {fieldErrors[f.name] && (
              <div id={errId} className="field-error">
                {fieldErrors[f.name]}
              </div>
            )}
          </div>
        );
      })}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? busyLabel : submitLabel}
      </button>
    </form>
  );
}

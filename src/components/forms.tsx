'use client';

import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { api, fieldErrorsOf, newIdempotencyKey, type ApiErr } from '@/lib/client-api';

/**
 * Generic JSON form that posts to /api/v1 and maps server field errors back onto inputs.
 * Used by every admin, customer and staff form so validation, errors and busy states behave identically.
 */

export type FieldOption = { value: string; label: string };
export type FieldDef = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'datetime-local' | 'password' | 'tel' | 'email';
  required?: boolean;
  options?: FieldOption[];
  help?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  autoComplete?: string;
  defaultValue?: string | number | boolean;
  dir?: 'ltr' | 'rtl';
  /** Convert the raw string (e.g. comma list -> array) before sending. */
  parse?: (raw: string | boolean) => unknown;
};

export type ApiFormProps = {
  endpoint: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  fields: FieldDef[];
  submitLabel: string;
  successMessage?: string;
  /** Full navigation after success (cookies/layout refresh). */
  successHref?: string;
  /** Otherwise refresh the current server data. */
  refreshOnSuccess?: boolean;
  /** Show a link after success instead of navigating (e.g. to continue to the next step). */
  successLink?: { href: string; label: string };
  idempotent?: boolean;
  /** Extra fixed values merged into the body. */
  extra?: Record<string, unknown>;
  resetOnSuccess?: boolean;
  busyLabel?: string;
  locale?: 'ar' | 'en';
  children?: ReactNode;
  onSuccess?: (data: unknown) => void;
};

export function ApiForm(props: ApiFormProps) {
  const { endpoint, method = 'POST', fields, submitLabel, successMessage, successHref, successLink, refreshOnSuccess, idempotent, extra, resetOnSuccess, busyLabel, onSuccess } = props;
  const formId = useId();
  // A success message survives the data refresh through sessionStorage (shown once on the next render).
  const flashKey = 'b2b-flash:' + endpoint;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErr | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [ok, setOk] = useState<string | null>(null);
  useEffect(() => {
    try {
      const msg = sessionStorage.getItem(flashKey);
      if (msg) {
        sessionStorage.removeItem(flashKey);
        setOk(msg);
      }
    } catch {
      /* storage unavailable: no flash message */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [extraInfo, setExtraInfo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setOk(null);
    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { ...(extra ?? {}) };
    for (const f of fields) {
      if (f.type === 'checkbox') {
        body[f.name] = form.get(f.name) === 'on';
        continue;
      }
      const raw = (form.get(f.name) ?? '').toString();
      if (raw === '' && !f.required) continue;
      if (f.parse) body[f.name] = f.parse(raw);
      else if (f.type === 'number') body[f.name] = raw === '' ? undefined : Number(raw);
      else body[f.name] = raw;
    }
    const res = await api<Record<string, unknown>>(endpoint, {
      method,
      body,
      idempotencyKey: idempotent ? newIdempotencyKey() : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res);
      setFieldErrors(fieldErrorsOf(res));
      return;
    }
    setOk(successMessage ?? 'Saved.');
    const data = res.data as { devCode?: string; otp?: { devCode?: string } } | undefined;
    const dev = data?.devCode ?? data?.otp?.devCode;
    if (dev) setExtraInfo(`DEV CODE (mock provider, development only): ${dev}`);
    onSuccess?.(res.data);
    if (resetOnSuccess) (e.currentTarget as HTMLFormElement).reset();
    if (successLink) return;
    // keep the message across the navigation or reload that follows
    try {
      sessionStorage.setItem(flashKey, successMessage ?? 'Saved.');
    } catch {
      /* storage unavailable */
    }
    if (successHref) window.location.assign(successHref);
    else if (refreshOnSuccess !== false) window.location.reload();
  }

  return (
    <form id={formId} onSubmit={onSubmit} noValidate aria-busy={busy}>
      {error && (
        <div className="alert alert-error" role="alert">
          {error.message}
          {error.requestId && <span className="muted"> ({error.requestId.slice(0, 8)})</span>}
        </div>
      )}
      {ok && <div className="alert alert-ok" role="status">{ok}</div>}
      {extraInfo && <div className="alert alert-warn" role="status">{extraInfo}</div>}
      {fields.map((f) => {
        const id = `${formId}-${f.name}`;
        const errId = `${id}-err`;
        const helpId = `${id}-help`;
        const describedBy = [f.help ? helpId : null, fieldErrors[f.name] ? errId : null].filter(Boolean).join(' ') || undefined;
        const common = {
          id,
          name: f.name,
          required: f.required,
          'aria-invalid': fieldErrors[f.name] ? true : undefined,
          'aria-describedby': describedBy,
          dir: f.dir,
          defaultValue: f.defaultValue as string | number | undefined,
        };
        return (
          <div className="field" key={f.name}>
            {f.type !== 'checkbox' && (
              <label htmlFor={id}>
                {f.label}
                {f.required ? ' *' : ''}
              </label>
            )}
            {f.type === 'textarea' ? (
              <textarea {...common} placeholder={f.placeholder} />
            ) : f.type === 'select' ? (
              <select {...common} defaultValue={f.defaultValue as string | undefined}>
                <option value="">—</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'checkbox' ? (
              <label className="row" style={{ fontWeight: 400 }}>
                <input type="checkbox" id={id} name={f.name} defaultChecked={!!f.defaultValue} aria-describedby={describedBy} /> {f.label}
              </label>
            ) : (
              <input
                {...common}
                type={f.type ?? 'text'}
                placeholder={f.placeholder}
                min={f.min}
                max={f.max}
                step={f.step}
                autoComplete={f.autoComplete}
                inputMode={f.type === 'number' ? 'numeric' : undefined}
              />
            )}
            {f.help && (
              <div id={helpId} className="field-help">
                {f.help}
              </div>
            )}
            {fieldErrors[f.name] && (
              <div id={errId} className="field-error">
                {fieldErrors[f.name]}
              </div>
            )}
          </div>
        );
      })}
      {props.children}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? busyLabel ?? '…' : submitLabel}
      </button>
      {ok && successLink && (
        <p>
          <a className="btn" href={successLink.href}>
            {successLink.label}
          </a>
        </p>
      )}
    </form>
  );
}

/** One-click server action with optional confirmation and reason. */
export function ActionButton({
  endpoint,
  method = 'POST',
  label,
  body,
  confirmText,
  reasonLabel,
  tone = 'default',
  successHref,
  idempotent,
  disabled,
}: {
  endpoint: string;
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  label: string;
  body?: Record<string, unknown>;
  confirmText?: string;
  reasonLabel?: string;
  tone?: 'default' | 'danger' | 'primary';
  successHref?: string;
  idempotent?: boolean;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cls = tone === 'danger' ? 'btn btn-danger btn-small' : tone === 'primary' ? 'btn btn-primary btn-small' : 'btn btn-small';
  async function run() {
    if (confirmText && !window.confirm(confirmText)) return;
    let reason: string | undefined;
    if (reasonLabel) {
      reason = window.prompt(reasonLabel) ?? undefined;
      if (!reason || reason.trim().length < 3) {
        setError('A reason of at least 3 characters is required.');
        return;
      }
    }
    setBusy(true);
    setError(null);
    const res = await api(endpoint, { method, body: { ...(body ?? {}), ...(reason ? { reason: reason.trim() } : {}) }, idempotencyKey: idempotent ? newIdempotencyKey() : undefined });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    if (successHref) window.location.assign(successHref);
    else window.location.reload();
  }
  return (
    <span className="row" style={{ display: 'inline-flex' }}>
      <button type="button" className={cls} onClick={run} disabled={busy || disabled}>
        {busy ? '…' : label}
      </button>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

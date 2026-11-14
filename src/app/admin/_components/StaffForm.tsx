'use client';

import { useId, useState, type FormEvent } from 'react';
import { api, fieldErrorsOf, type ApiErr } from '@/lib/client-api';

/** Creates a STAFF user. Roles are chosen with checkboxes (ApiForm cannot send arrays). */
export function StaffForm({ roles, locale }: { roles: Array<{ name: string; label: string }>; locale: 'ar' | 'en' }) {
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErr | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [ok, setOk] = useState<string | null>(null);
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setOk(null);
    const form = new FormData(e.currentTarget);
    const roleNames = roles.filter((r) => form.get(`role-${r.name}`) === 'on').map((r) => r.name);
    const res = await api(`/api/v1/admin/staff`, {
      method: 'POST',
      body: {
        phone: (form.get('phone') ?? '').toString(),
        fullNameEn: (form.get('fullNameEn') ?? '').toString(),
        password: (form.get('password') ?? '').toString(),
        roleNames,
      },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res);
      setFieldErrors(fieldErrorsOf(res));
      return;
    }
    setOk(L('تم إنشاء الموظف.', 'Staff user created.'));
    (e.currentTarget as HTMLFormElement).reset();
  }

  const fe = (name: string) =>
    fieldErrors[name] ? (
      <div className="field-error" role="alert">
        {fieldErrors[name]}
      </div>
    ) : null;

  return (
    <form id={formId} onSubmit={onSubmit} noValidate aria-busy={busy}>
      {error && <div className="alert alert-error" role="alert">{error.message}</div>}
      {ok && <div className="alert alert-ok" role="status">{ok}</div>}
      <div className="adm-form-fields">
        <div className="field">
          <label htmlFor={`${formId}-phone`}>{L('رقم الهاتف', 'Phone')} *</label>
          <input id={`${formId}-phone`} name="phone" type="tel" required autoComplete="off" placeholder="07XXXXXXXXX" />
          {fe('phone')}
        </div>
        <div className="field">
          <label htmlFor={`${formId}-name`}>{L('الاسم (إنجليزي)', 'Full name (English)')} *</label>
          <input id={`${formId}-name`} name="fullNameEn" type="text" required maxLength={120} />
          {fe('fullNameEn')}
        </div>
        <div className="field">
          <label htmlFor={`${formId}-password`}>{L('كلمة مرور مؤقتة', 'Initial password')} *</label>
          <input id={`${formId}-password`} name="password" type="password" required minLength={10} autoComplete="new-password" />
          <div className="field-help">{L('10 أحرف على الأقل، تتضمن حرفاً ورقماً. تُخزَّن مشفّرة.', 'At least 10 characters, including a letter and a digit. Stored hashed.')}</div>
          {fe('password')}
        </div>
      </div>
      <fieldset className="adm-fieldset" style={{ marginBlockEnd: 4 }}>
        <legend className="adm-role-legend">{L('الأدوار', 'Roles')} *</legend>
        <div className="adm-chips">
          {roles.map((r) => (
            <label key={r.name} className="adm-chip">
              <input type="checkbox" name={`role-${r.name}`} /> {r.label}
            </label>
          ))}
        </div>
        {fe('roleNames')}
      </fieldset>
      <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginBlockStart: 12 }}>
        {busy ? L('جارٍ الإنشاء…', 'Creating…') : L('إنشاء موظف', 'Create staff user')}
      </button>
    </form>
  );
}

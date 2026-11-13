'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, fieldErrorsOf, type ApiErr } from '@/lib/client-api';
import type { Loc } from './shared';

/**
 * Access recovery (AUTH-04): step 1 requests a 6-digit code, step 2 sets a new password and revokes old sessions.
 * The request response is the same for known and unknown phones, so the UI never reveals which numbers exist.
 */
export function RecoverFlow({ locale }: { locale: Loc }) {
  const ar = locale === 'ar';
  const [step, setStep] = useState<'request' | 'confirm' | 'done'>('request');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiErr | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  async function requestCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setFieldErr({});
    setInfo(null);
    const res = await api<{ sent: boolean; devCode?: string }>('/api/v1/auth/recovery/request', { method: 'POST', body: { phone: phone.trim() } });
    setBusy(false);
    if (!res.ok) {
      setErr(res);
      setFieldErr(fieldErrorsOf(res));
      return;
    }
    setDevCode(res.data?.devCode ?? null);
    setInfo(ar ? 'إذا كان الرقم مسجلًا فسيصلك رمز التحقق.' : 'If the number is registered, a verification code will arrive.');
    setStep('confirm');
  }

  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== password2) {
      setFieldErr({ newPassword: ar ? 'كلمتا المرور غير متطابقتين.' : 'The passwords do not match.' });
      return;
    }
    setBusy(true);
    setErr(null);
    setFieldErr({});
    const res = await api('/api/v1/auth/recovery/confirm', { method: 'POST', body: { phone: phone.trim(), code: code.trim(), newPassword: password } });
    setBusy(false);
    if (!res.ok) {
      setErr(res);
      setFieldErr(fieldErrorsOf(res));
      return;
    }
    setPassword('');
    setPassword2('');
    setStep('done');
  }

  if (step === 'done') {
    return (
      <div className="stack">
        <p className="alert alert-ok" role="status">
          {ar ? 'تم تعيين كلمة المرور الجديدة. أعد تسجيل الدخول على كل أجهزتك.' : 'Your new password is set. Sign in again on your devices.'}
        </p>
        <Link className="btn btn-primary" href="/login">
          {ar ? 'تسجيل الدخول' : 'Sign in'}
        </Link>
      </div>
    );
  }

  const fieldErrorText = (name: string) =>
    fieldErr[name] ? (
      <div id={`recover-${name}-err`} className="field-error">
        {fieldErr[name]}
      </div>
    ) : null;

  return (
    <div className="stack">
      {err && (
        <p className="alert alert-error" role="alert">
          {err.message}
        </p>
      )}
      {info && (
        <p className="alert alert-ok" role="status">
          {info}
        </p>
      )}
      {devCode && (
        <p className="alert alert-warn" role="status">
          {ar ? 'رمز التطوير (مزود وهمي، للتطوير فقط):' : 'DEV CODE (mock provider, development only):'} <strong dir="ltr">{devCode}</strong>
        </p>
      )}

      {step === 'request' && (
        <form onSubmit={requestCode} noValidate aria-busy={busy}>
          <div className="field">
            <label htmlFor="recover-phone">{ar ? 'رقم الهاتف' : 'Phone number'} *</label>
            <input
              id="recover-phone"
              type="tel"
              dir="ltr"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={!!fieldErr.phone}
              aria-describedby={fieldErr.phone ? 'recover-phone-err' : undefined}
              placeholder="07XXXXXXXXX"
            />
            {fieldErrorText('phone')}
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy || phone.trim().length < 7}>
            {busy ? '…' : ar ? 'إرسال رمز التحقق' : 'Send verification code'}
          </button>
        </form>
      )}

      {step === 'confirm' && (
        <form onSubmit={confirm} noValidate aria-busy={busy} className="stack">
          <div className="field">
            <label htmlFor="recover-code">{ar ? 'رمز التحقق (6 أرقام)' : 'Verification code (6 digits)'} *</label>
            <input
              id="recover-code"
              inputMode="numeric"
              dir="ltr"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={!!fieldErr.code}
              aria-describedby={fieldErr.code ? 'recover-code-err' : undefined}
            />
            {fieldErrorText('code')}
          </div>
          <div className="field">
            <label htmlFor="recover-password">{ar ? 'كلمة المرور الجديدة (10 أحرف على الأقل)' : 'New password (at least 10 characters)'} *</label>
            <input
              id="recover-password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!fieldErr.newPassword}
              aria-describedby={fieldErr.newPassword ? 'recover-newPassword-err' : undefined}
            />
            {fieldErrorText('newPassword')}
          </div>
          <div className="field">
            <label htmlFor="recover-password2">{ar ? 'تأكيد كلمة المرور' : 'Confirm new password'} *</label>
            <input id="recover-password2" type="password" autoComplete="new-password" minLength={10} required value={password2} onChange={(e) => setPassword2(e.target.value)} />
          </div>
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6 || password.length < 10}>
              {busy ? '…' : ar ? 'تعيين كلمة المرور' : 'Set new password'}
            </button>
            <button type="button" className="btn" onClick={() => setStep('request')} disabled={busy}>
              {ar ? 'إرسال رمز جديد' : 'Send a new code'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

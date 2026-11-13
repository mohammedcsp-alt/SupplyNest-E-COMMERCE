'use client';

import { useState } from 'react';
import { api } from '@/lib/client-api';
import type { Locale } from '@/lib/i18n';

/** Requests a new registration code. Shows the dev code only in development (mock provider). */
export function ResendOtp({ locale }: { locale: Locale }) {
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ar = locale === 'ar';
  async function resend() {
    setBusy(true);
    setMsg(null);
    const res = await api<{ devCode?: string }>('/api/v1/auth/otp/request', { method: 'POST', body: { phone, purpose: 'REGISTRATION' } });
    setBusy(false);
    if (!res.ok) setMsg(res.message);
    else setMsg(res.data?.devCode ? `DEV CODE: ${res.data.devCode}` : ar ? 'إذا كان الرقم مسجلًا فسيصل رمز جديد.' : 'If the number is registered, a new code will arrive.');
  }
  return (
    <div className="card">
      <label htmlFor="resend-phone">{ar ? 'إعادة إرسال الرمز' : 'Resend the code'}</label>
      <div className="row">
        <input id="resend-phone" type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XXXXXXXXX" />
        <button type="button" className="btn" onClick={resend} disabled={busy || phone.length < 7}>
          {ar ? 'إرسال' : 'Send'}
        </button>
      </div>
      {msg && (
        <p role="status" className="muted">
          {msg}
        </p>
      )}
    </div>
  );
}

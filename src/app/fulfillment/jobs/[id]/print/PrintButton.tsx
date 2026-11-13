'use client';

import { useState } from 'react';
import { api } from '@/lib/client-api';
import type { Locale } from '@/lib/i18n';

/** Counts the print on the server first (POST /print), then opens the browser print dialog. */
export function PrintButton({ jobId, locale }: { jobId: string; locale: Locale }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const L = (ar: string, en: string) => (locale === 'ar' ? ar : en);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await api(`/api/v1/fulfillment/jobs/${jobId}/print`, { method: 'POST' });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    window.print();
  }

  return (
    <span className="no-print row" style={{ display: 'inline-flex' }}>
      <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
        {busy ? '…' : L('طباعة', 'Print')}
      </button>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

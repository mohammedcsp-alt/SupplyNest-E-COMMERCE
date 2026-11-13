'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client-api';

/** Generic DELETE-and-refresh button (favorites removal). */
export function RemoveButton({ endpoint, label, busyLabel, confirmText }: { endpoint: string; label: string; busyLabel: string; confirmText?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run() {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setErr(null);
    const res = await api(endpoint, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      setErr(res.message);
      return;
    }
    router.refresh();
  }
  return (
    <span className="row" style={{ display: 'inline-flex' }}>
      <button type="button" className="btn btn-danger btn-small" onClick={run} disabled={busy}>
        {busy ? busyLabel : label}
      </button>
      {err && (
        <span className="field-error" role="alert">
          {err}
        </span>
      )}
    </span>
  );
}
